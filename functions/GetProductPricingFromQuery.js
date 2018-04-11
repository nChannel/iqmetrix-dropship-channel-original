const stubName = "GetProductPricingFromQuery";
const nc = require("./util/ncUtils");
const validationMessages = [];
const out = { ncStatusCode: null, response: {}, payload: {} };
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
  maxParallelRequests;

function GetProductPricingFromQuery(ncUtil, channelProfile, flowContext, payload, callback) {
  logInfo(`Beginning ${stubName}...`);

  validateArguments(...arguments)
    .then(getProductLists)
    .then(flattenProductLists)
    .then(getProductDetails)
    .then(filterVendors)
    .then(getPrices)
    //.then(keepModifiedItems)
    .then(buildResponseObject)
    .catch(error => {
      logError(`An error occurred during ${stubName}: ${error}`);
      out.ncStatusCode = error.statusCode ? error.statusCode : 500;
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

async function getProductLists() {
  logInfo("Get product lists...");
  const productLists = await Promise.all(subscriptionLists.map(getProductList));
  return productLists;
}

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

async function flattenProductLists(productLists) {
  logInfo("Flatten product lists...");
  return [].concat(...productLists);
}

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

async function filterVendors(productList) {
  logInfo("Filter vendors...");
  productList.forEach(product => {
    const entityId = product.subscriptionList.entityId;
    product.ProductDetails.VendorSkus = product.ProductDetails.VendorSkus.filter(vendor => {
      return vendor.Entity && vendor.Entity.Id == entityId;
    });
  });
  return productList;
}

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

async function getPricing(product) {
  logInfo(`Get pricing for product ${product.CatalogItemId}...`)
  const response = await request.get({
    url: `${protocol}://pricing${environment}.iqmetrix.net/v1/Companies(${company_id})/Entities(${location_id})/CatalogItems(${product.CatalogItemId})/Pricing`
  });
  product.Pricing = response.body[0];
  return product;
}

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

async function buildResponseObject(products) {
  logInfo(`Submitting ${products.length} modified prices...`);
  if (products.length > 0) {
    out.ncStatusCode = 200;
    out.payload = [];
    products.forEach(product => {
      out.payload.push({
        doc: product,
        productRemoteID: "",
        productBusinessReference: ""
      });
    });
  } else {
    out.ncStatusCode = 204;
  }
  return out;
}

async function validateArguments(ncUtil, channelProfile, flowContext, payload, callback) {
  logInfo("Validating arguments...");
  validateCallback(callback);
  validateNcUtil(ncUtil);
  validateChannelProfile(channelProfile);
  validateFlowContext(flowContext);
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

  request = baseRequest.defaults({
    auth: {
      bearer: access_token
    },
    json: true,
    gzip: true,
    resolveWithFullResponse: true
  });
}

function validateNcUtil(ncUtil) {
  if (!nc.isObject(ncUtil)) {
    validationMessages.push(`The ncUtil object is ${ncUtil == null ? "missing" : "invalid"}.`);
  }
}

function validateChannelProfile(channelProfile) {
  if (!nc.isObject(channelProfile)) {
    validationMessages.push(`The channelProfile object is ${channelProfile == null ? "missing" : "invalid"}.`);
  } else {
    validateChannelSettingsValues(channelProfile.channelSettingsValues);
    validateChannelAuthValues(channelProfile.channelAuthValues);
    if (!nc.isNonEmptyArray(channelProfile.productBusinessReferences)) {
      validationMessages.push(
        `The channelProfile.productBusinessReferences array is ${
          channelProfile.productBusinessReferences == null ? "missing" : "invalid"
        }.`
      );
    }
  }
}

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

function validateFlowContext(flowContext) {
  if (!nc.isObject(flowContext)) {
    validationMessages.push(`The flowContext object is ${flowContext == null ? "missing" : "invalid"}.`);
  }
}

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
