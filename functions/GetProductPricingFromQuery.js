const stubName = "GetProductPricingFromQuery";
const nc = require("./util/ncUtils");
const baseRequest = require("request-promise-native");
let request,
  access_token,
  company_id,
  location_id,
  protocol,
  environment,
  subscriptionLists,
  startDateGMT,
  endDateGMT,
  maxParallelRequests,
  productPricingBusinessReferences,
  validationMessages,
  out;

/**
 * The GetProductPricingFromQuery function will retrieve product pricing from iQmetrix APIs.
 *
 * First, it will make 1 api call for each subscription list to fetch the product headers for that list.
 * Second, it will merge these lists into a single master list of products.
 * Third, it will split the product list into batches of 500 products and make 1 api call per batch to fetch details.
 * Fourth, it will filter the VendorSkus array to include only the supplier provided for the subscription list.
 * Fifth, it will make 1 api call for each product on the list to fetch pricing details.
 * Sixth, it will check the modified date on the pricing element for each item,
 *        discarding the item if it has not been modified within the requested time frame.
 * Finally, it will pass the remaining products back to the callback function.
 */
function GetProductPricingFromQuery(ncUtil, channelProfile, flowContext, payload, callback) {
  logInfo(`Beginning ${stubName}...`);
  validateCallback(callback);

  validateArguments(...arguments)
    .then(getProductLists)
    .then(flattenProductLists)
    .then(getProductDetails)
    .then(filterVendors)
    .then(getPrices)
    //.then(keepModifiedItems) // The necessary timestamp is not yet being returned by the iQmetrix API
    .then(buildResponseObject)
    .catch(error => {
      logError(`An error occurred during ${stubName}: ${error}`);
      if (!out.ncStatusCode) {
        out.ncStatusCode = error.statusCode ? error.statusCode : 500;
      }
      out.payload.error = error;
      return out;
    })
    .then(callback)
    .catch(error => {
      logError("The callback function threw an exception.");
      logError(error);
      throw error;
    });
}

/**
 * Pulls down the product headers for each subscription list provided
 *
 * @returns array of arrays of products
 */
async function getProductLists() {
  logInfo("Get product lists...");
  const productLists = await Promise.all(subscriptionLists.map(getProductList));
  return productLists;
}

/**
 * Fetches products belonging to specified subscription list
 *
 * @param {object} subscriptionList Provided by channelProfileSettings
 * @returns list of products with subscription list details appended to each product for future reference
 */
async function getProductList(subscriptionList) {
  logInfo(`Get product list [${subscriptionList.listId}]...`);
  const response = await request.get({
    url: `${protocol}://catalogs${environment}.iqmetrix.net/v1/Companies(${company_id})/Catalog/Items(SourceId=${
      subscriptionList.listId
    })`
  });
  response.body.Items.forEach(item => {
    item.subscriptionList = subscriptionList;
  });
  return response.body.Items;
}

/**
 * Merges array of arrays into a single list of products
 *
 * @param {array[]} productLists
 * @returns array of products
 */
async function flattenProductLists(productLists) {
  logInfo("Flatten product lists...");
  return [].concat(...productLists);
}

/**
 * Fetches product details for each product in batches of up to 500
 *
 * @param {array} productList
 * @returns product list with additional details appended to each product
 */
async function getProductDetails(productList) {
  logInfo("Get product details...");
  const allIds = productList.map(p => p.CatalogItemId);
  const batchedIds = [];
  const max = 500;
  let current = 0;
  do {
    const batchIds = allIds.slice(current, current + max);
    batchedIds.push(batchIds);
    current = current + max;
  } while (current < allIds.length);
  const batchedDetails = await Promise.all(batchedIds.map(getProductDetailsBulk));
  const CatalogItems = Object.assign({}, ...batchedDetails);
  productList.forEach(product => {
    product.ProductDetails = CatalogItems[product.CatalogItemId];
  });
  return productList;
}

/**
 * POST list of catalog ids to iQmetrix api and receive array of product details
 *
 * @param {array} catalogIds
 * @returns product details
 */
async function getProductDetailsBulk(catalogIds) {
  logInfo(`Get ${catalogIds.length} product details...`);
  const response = await request.post({
    url: `${protocol}://catalogs${environment}.iqmetrix.net/v1/Companies(${company_id})/Catalog/Items/ProductDetails/Bulk`,
    body: {
      CatalogItemIds: catalogIds
    }
  });
  return response.body.CatalogItems;
}

/**
 * Remove all but the supplier specified with the associated subscription list
 *
 * @param {array} productList
 * @returns array of products with unused vendors removed
 */
async function filterVendors(productList) {
  logInfo("Filter vendors...");
  productList.forEach(product => {
    const entityId = product.subscriptionList.entityId;
    const VendorSkus = product.ProductDetails.VendorSkus.filter(vendor => {
      return vendor.Entity && vendor.Entity.Id == entityId;
    });
    product.VendorSku = VendorSkus[0];
  });
  return productList;
}

/**
 * Gets prices for products
 *
 * @param {any} productList
 * @returns array of products with pricing information appended to each product
 */
async function getPrices(productList) {
  logInfo("Get prices...");
  const numProducts = productList.length;
  if (maxParallelRequests === 0) {
    maxParallelRequests = numProducts;
  }
  let products = [];
  let current = 0;
  do {
    const batch = productList.slice(current, current + maxParallelRequests);
    logInfo(`Get products ${current} - ${current + maxParallelRequests}...`);
    current = current + maxParallelRequests;
    const productBatch = await Promise.all(batch.map(getPricing));
    products.push(...productBatch);
  } while (current < numProducts);
  return products;
}

/**
 * Gets pricing details for an individual product
 *
 * @param {object} product
 * @returns product with pricing details appended
 */
async function getPricing(product) {
  logInfo(`Get pricing for product ${product.CatalogItemId}...`);
  const response = await request.get({
    url: `${protocol}://pricing${environment}.iqmetrix.net/v1/Companies(${company_id})/Entities(${location_id})/CatalogItems(${
      product.CatalogItemId
    })/Pricing`
  });
  product.Pricing = response.body[0];
  return product;
}

/**
 * Checks the modified timestamp in the pricing element of each product and
 * discards products that were not modified within the requested time frame.
 *
 * @param {array} productList
 * @returns array of products
 */
async function keepModifiedItems(productList) {
  logInfo("Keep items whose quantity has been modified...");
  const start = Date.parse(startDateGMT);
  const end = Date.parse(endDateGMT);
  const products = productList.filter(product => {
    const priceMod = Date.parse(product.Pricing.DateUpdatedUtc);
    return priceMod >= start && priceMod <= end;
  });
  logInfo(`${products.length} of ${productList.length} prices have been modified withing the given date range.`);
  return products;
}

/**
 * Builds the response object to be provided to the callback function
 *
 * @param {array} products
 * @returns response object
 */
async function buildResponseObject(products) {
  logInfo(`Submitting ${products.length} modified prices...`);
  if (products.length > 0) {
    out.ncStatusCode = 200;
    out.payload = [];
    products.forEach(product => {
      out.payload.push({
        doc: product,
        productPricingRemoteID: product.CatalogItemId,
        productPricingBusinessReference: nc.extractBusinessReferences(productPricingBusinessReferences, product)
      });
    });
  } else {
    out.ncStatusCode = 204;
  }
  return out;
}

/**
 * Validates the arguments passed into this function
 *
 * @param {object} ncUtil
 * @param {object} channelProfile
 * @param {object} flowContext
 * @param {object} payload
 */
async function validateArguments(ncUtil, channelProfile, flowContext, payload) {
  logInfo("Validating arguments...");
  validationMessages = [];
  out = { ncStatusCode: null, response: {}, payload: {} };

  validateNcUtil(ncUtil);
  validateChannelProfile(channelProfile);
  //validateFlowContext(flowContext);
  validatePayload(payload);

  if (validationMessages.length > 0) {
    validationMessages.forEach(msg => logError(msg));
    out.ncStatusCode = 400;
    throw new Error(`${stubName}: Invalid request [${validationMessages.join(", ")}]`);
  }

  company_id = channelProfile.channelAuthValues.company_id;
  location_id = channelProfile.channelAuthValues.location_id;
  access_token = channelProfile.channelAuthValues.access_token;
  protocol = channelProfile.channelSettingsValues.protocol;
  environment = channelProfile.channelSettingsValues.environment;
  maxParallelRequests = channelProfile.channelSettingsValues.maxParallelRequests;
  subscriptionLists = channelProfile.channelSettingsValues.subscriptionLists;
  startDateGMT = payload.doc.modifiedDateRange.startDateGMT;
  endDateGMT = payload.doc.modifiedDateRange.endDateGMT;
  productPricingBusinessReferences = channelProfile.productPricingBusinessReferences;

  request = baseRequest.defaults({
    auth: {
      bearer: access_token
    },
    json: true,
    gzip: true,
    resolveWithFullResponse: true
  });
}

/**
 * Validate that the ncUtil argument is an object
 *
 * @param {object} ncUtil
 */
function validateNcUtil(ncUtil) {
  if (!nc.isObject(ncUtil)) {
    validationMessages.push(`The ncUtil object is ${ncUtil == null ? "missing" : "invalid"}.`);
  }
}

/**
 * Validate that the channelProfile argument is an object and that it has specific properties that are required.
 *
 * @param {object} channelProfile
 * @param {object} channelProfile.channelSettingsValues
 * @param {object} channelProfile.channelAuthValues
 * @param {string[]} channelProfile.productPricingBusinessReferences
 */
function validateChannelProfile(channelProfile) {
  if (!nc.isObject(channelProfile)) {
    validationMessages.push(`The channelProfile object is ${channelProfile == null ? "missing" : "invalid"}.`);
  } else {
    validateChannelSettingsValues(channelProfile.channelSettingsValues);
    validateChannelAuthValues(channelProfile.channelAuthValues);
    if (!nc.isNonEmptyArray(channelProfile.productPricingBusinessReferences)) {
      validationMessages.push(
        `The channelProfile.productPricingBusinessReferences array is ${
          channelProfile.productPricingBusinessReferences == null ? "missing" : "invalid"
        }.`
      );
    }
  }
}

/**
 * Validate that the channelSettingsValues parameter is an object and that it has specific properties that are required.
 *
 * @param {object} channelSettingsValues
 * @param {string} channelSettingsValues.protocol
 * @param {string} channelSettingsValues.environment
 * @param {number} channelSettingsValues.maxParallelRequests
 * @param {object[]} channelSettingsValues.subscriptionLists
 */
function validateChannelSettingsValues(channelSettingsValues) {
  if (!nc.isObject(channelSettingsValues)) {
    validationMessages.push(
      `The channelSettingsValues object is ${channelSettingsValues == null ? "missing" : "invalid"}.`
    );
  } else {
    if (!nc.isNonEmptyString(channelSettingsValues.protocol)) {
      validationMessages.push(
        `The channelSettingsValues.protocol string is ${
          channelSettingsValues.protocol == null ? "missing" : "invalid"
        }.`
      );
    }
    if (!nc.isString(channelSettingsValues.environment)) {
      validationMessages.push(
        `The channelSettingsValues.environment string is ${
          channelSettingsValues.environment == null ? "missing" : "invalid"
        }.`
      );
    }
    if (!nc.isInteger(channelSettingsValues.maxParallelRequests)) {
      validationMessages.push(
        `The channelSettingsValues.maxParallelRequests integer is ${
          channelSettingsValues.maxParallelRequests == null ? "missing" : "invalid"
        }.`
      );
    }
    if (!nc.isNonEmptyArray(channelSettingsValues.subscriptionLists)) {
      validationMessages.push(
        `The channelSettingsValues.subscriptionLists array is ${
          channelSettingsValues.subscriptionLists == null ? "missing" : "invalid"
        }.`
      );
    }
  }
}

/**
 * Validate that the channelAuthValues parameter is an object and that it has specific properties that are required.
 *
 * @param {object} channelAuthValues
 * @param {string} channelAuthValues.company_id
 * @param {string} channelAuthValues.location_id
 * @param {string} channelAuthValues.access_token
 */
function validateChannelAuthValues(channelAuthValues) {
  if (!nc.isObject(channelAuthValues)) {
    validationMessages.push(`The channelAuthValues object is ${channelAuthValues == null ? "missing" : "invalid"}.`);
  } else {
    if (!nc.isNonEmptyString(channelAuthValues.company_id)) {
      validationMessages.push(
        `The channelAuthValues.company_id string is ${channelAuthValues.company_id == null ? "missing" : "invalid"}.`
      );
    }
    if (!nc.isNonEmptyString(channelAuthValues.location_id)) {
      validationMessages.push(
        `The channelAuthValues.location_id string is ${channelAuthValues.location_id == null ? "missing" : "invalid"}.`
      );
    }
    if (!nc.isNonEmptyString(channelAuthValues.access_token)) {
      validationMessages.push(
        `The channelAuthValues.access_token string is ${
          channelAuthValues.access_token == null ? "missing" : "invalid"
        }.`
      );
    }
  }
}

/**
 * Validate that the flowContext argument is an object.
 *
 * @param {object} flowContext
 */
function validateFlowContext(flowContext) {
  if (!nc.isObject(flowContext)) {
    validationMessages.push(`The flowContext object is ${flowContext == null ? "missing" : "invalid"}.`);
  }
}

/**
 * Validate that the payload argument is an object and that it has specific properties that are required.
 *
 * @param {object} payload
 * @param {object} payload.doc
 * @param {object} payload.doc.modifiedDateRange
 * @param {string} payload.doc.modifiedDateRange.startDateGMT
 * @param {string} payload.doc.modifiedDateRange.endDateGMT
 */
function validatePayload(payload) {
  if (!nc.isObject(payload)) {
    validationMessages.push(`The payload object is ${payload == null ? "missing" : "invalid"}.`);
  } else {
    if (!nc.isObject(payload.doc)) {
      validationMessages.push(`The payload.doc object is ${payload.doc == null ? "missing" : "invalid"}.`);
    } else {
      if (!nc.isObject(payload.doc.modifiedDateRange)) {
        validationMessages.push(
          `The payload.doc.modifiedDateRange object is ${
            payload.doc.modifiedDateRange == null ? "missing" : "invalid"
          }.`
        );
      } else {
        if (!nc.isNonEmptyString(payload.doc.modifiedDateRange.startDateGMT)) {
          validationMessages.push(
            `The payload.doc.modifiedDateRange.startDateGMT string is ${
              payload.doc.modifiedDateRange.startDateGMT == null ? "missing" : "invalid"
            }.`
          );
        }
        if (!nc.isNonEmptyString(payload.doc.modifiedDateRange.endDateGMT)) {
          validationMessages.push(
            `The payload.doc.modifiedDateRange.endDateGMT string is ${
              payload.doc.modifiedDateRange.endDateGMT == null ? "missing" : "invalid"
            }.`
          );
        }
      }
    }
  }
}

/**
 * Validate that the callback argument is a function
 *
 * @param {function} cb
 */
function validateCallback(cb) {
  if (!nc.isFunction(cb)) {
    logError(`The callback function is ${cb == null ? "missing" : "invalid"}.`);
    if (cb == null) {
      throw new Error("A callback function was not provided");
    }
    throw new TypeError("callback is not a function");
  }
}

function logInfo(msg) {
  nc.log(msg, "info", stubName);
}

function logError(msg) {
  nc.log(msg, "error", stubName);
}

module.exports.GetProductPricingFromQuery = GetProductPricingFromQuery;
