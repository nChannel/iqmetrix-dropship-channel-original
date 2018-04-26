const baseRequest = require("request-promise-native");
const nc = require("./util/ncUtils");

function CheckForCustomer(ncUtil, channelProfile, flowContext, payload, callback) {
    const stub = new nc.Stub("CheckForCustomer", ...arguments);

    nc.logInfo(`Beginning ${stub.name}...`);
    nc.validateCallback(callback);

    validateArguments(stub)
        .then(searchCustomer)
        .catch(error => {
            nc.logError(error);

            if (error.name === "StatusCodeError") {
                stub.out.ncStatusCode = error.statusCode;
                stub.out.response.endpointStatusCode = error.statusCode;
                stub.out.response.endpointStatusMessage = error.message;
            } else {
                stub.out.ncStatusCode = stub.out.ncStatusCode || 500;
            }

            stub.out.payload.error = error;

            return stub.out;
        })
        .then(callback)
        .catch(error => {
            nc.logError("The callback function threw an exception:");
            nc.logError(error);
            throw error;
        });
}

async function searchCustomer(stub) {
    nc.logInfo("Searching for customer...");

    const criteria = nc
        .extractBusinessReferences(stub.channelProfile.customerBusinessReferences, stub.payload.doc, null)
        .map(value => `Criteria eq '${value}'`);

    const response = await stub.request.get({
        url: `${stub.channelProfile.channelSettingsValues.protocol}://crm${
            stub.channelProfile.channelSettingsValues.environment
        }.iqmetrix.net/v1/Companies(${
            stub.channelProfile.channelAuthValues.company_id
        })/CustomerSearch?$filter=${criteria.join(" and ")}`
    });

    const customers = response.body;
    stub.out.response.endpointStatusCode = response.statusCode;

    if (!nc.isArray(customers)) {
        throw new TypeError(`Search response is not an array. Response: ${JSON.stringify(customers, null, 2)}`);
    }
    if (customers.length === 1) {
        if (!nc.isObject(customers[0]) || !nc.isNonEmptyString(customers[0].Id)) {
            throw new TypeError(
                `Search response is not in expected format. Response: ${JSON.stringify(customers[0], null, 2)}`
            );
        }
        stub.out.ncStatusCode = 200;
        stub.out.payload.customerRemoteID = customers[0].Id;
        stub.out.payload.customerBusinessReference = nc.extractBusinessReferences(
            stub.channelProfile.customerBusinessReferences,
            customers[0]
        );
    } else if (customers.length === 0) {
        nc.logInfo("Customer does not exist.");
        stub.out.ncStatusCode = 204;
    } else {
        stub.out.payload.error = new Error(`Search returned multiple customers. Response: ${JSON.stringify(customers, null, 2)}`);
        stub.out.ncStatusCode = 409;
    }

    return stub.out;
}

async function validateArguments(stub) {
    nc.logInfo("Validating arguments...");
    const validationMessages = [];

    validationMessages.push(...validateNcUtil(stub.ncUtil));
    validationMessages.push(...validateChannelProfile(stub.channelProfile));
    validationMessages.push(...validatePayload(stub.payload));

    if (validationMessages.length > 0) {
        validationMessages.forEach(msg => logError(msg));
        stub.out.ncStatusCode = 400;
        throw new Error(`Invalid request [${validationMessages.join(" ")}]`);
    }

    stub.request = baseRequest.defaults({
        auth: {
            bearer: stub.channelProfile.channelAuthValues.access_token
        },
        json: true,
        gzip: true,
        resolveWithFullResponse: true
    });

    return stub;
}

function validateNcUtil(ncUtil) {
    const messages = [];
    if (!isObject(ncUtil)) {
        messages.push(`The ncUtil object is ${ncUtil == null ? "missing" : "invalid"}.`);
    }
    return messages;
}

function validatePayload(payload) {
    const messages = [];
    if (!nc.isObject(payload)) {
        messages.push(`The payload object is ${payload == null ? "missing" : "invalid"}.`);
    } else {
        if (!nc.isObject(payload.doc)) {
            messages.push(`The payload.doc object is ${payload.doc == null ? "missing" : "invalid"}.`);
        }
    }
    return messages;
}

function validateChannelProfile(channelProfile) {
    const messages = [];
    if (!nc.isObject(channelProfile)) {
        messages.push(`The channelProfile object is ${channelProfile == null ? "missing" : "invalid"}.`);
    } else {
        messages.push(...validateChannelSettingsValues(channelProfile.channelSettingsValues));
        messages.push(...validateChannelAuthValues(channelProfile.channelAuthValues));
        if (!nc.isNonEmptyArray(channelProfile.customerBusinessReferences)) {
            messages.push(
                `The channelProfile.customerBusinessReferences array is ${
                    channelProfile.customerBusinessReferences == null ? "missing" : "invalid"
                }.`
            );
        }
    }
    return messages;
}

function validateChannelSettingsValues(channelSettingsValues) {
    const messages = [];
    if (!nc.isObject(channelSettingsValues)) {
        messages.push(`The channelSettingsValues object is ${channelSettingsValues == null ? "missing" : "invalid"}.`);
    } else {
        if (!nc.isNonEmptyString(channelSettingsValues.protocol)) {
            messages.push(
                `The channelSettingsValues.protocol string is ${
                    channelSettingsValues.protocol == null ? "missing" : "invalid"
                }.`
            );
        }
        if (!nc.isString(channelSettingsValues.environment)) {
            messages.push(
                `The channelSettingsValues.environment string is ${
                    channelSettingsValues.environment == null ? "missing" : "invalid"
                }.`
            );
        }
    }
    return messages;
}

function validateChannelAuthValues(channelAuthValues) {
    const messages = [];
    if (!nc.isObject(channelAuthValues)) {
        messages.push(`The channelAuthValues object is ${channelAuthValues == null ? "missing" : "invalid"}.`);
    } else {
        if (!nc.isNonEmptyString(channelAuthValues.company_id)) {
            messages.push(
                `The channelAuthValues.company_id string is ${
                    channelAuthValues.company_id == null ? "missing" : "invalid"
                }.`
            );
        }
        if (!nc.isNonEmptyString(channelAuthValues.access_token)) {
            messages.push(
                `The channelAuthValues.access_token string is ${
                    channelAuthValues.access_token == null ? "missing" : "invalid"
                }.`
            );
        }
    }
    return messages;
}

module.exports.CheckForCustomer = CheckForCustomer;
