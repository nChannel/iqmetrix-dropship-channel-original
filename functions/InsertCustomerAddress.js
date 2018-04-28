const baseRequest = require("request-promise-native");
const nc = require("./util/ncUtils");

function InsertCustomerAddress(ncUtil, channelProfile, flowContext, payload, callback) {
    const stub = new nc.Stub("InsertCustomerAddress", ...arguments);
    const responseCodes = [201, 400, 429, 500];

    nc.logInfo(`Beginning ${stub.name}...`);
    nc.validateCallback(callback);

    validateArguments(stub)
        .then(postCustomerAddress)
        .catch(error => {
            nc.logError(error);

            if (error.name === "StatusCodeError") {
                stub.out.ncStatusCode = responseCodes.includes(error.statusCode) ? error.statusCode : 400;
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

async function postCustomerAddress(stub) {
    nc.logInfo("Posting customer address...");

    const response = await stub.request.post({
        url: `${stub.channelProfile.channelSettingsValues.protocol}://crm${
            stub.channelProfile.channelSettingsValues.environment
        }.iqmetrix.net/v1/Companies(${stub.channelProfile.channelAuthValues.company_id})/Customers(${
            stub.payload.customerRemoteID
        })/Addresses`,
        body: stub.payload.doc
    });

    const customerAddress = response.body;
    stub.out.response.endpointStatusCode = response.statusCode;
    stub.out.ncStatusCode = response.statusCode;
    stub.out.payload.customerAddressRemoteID = customerAddress.Id;
    stub.out.payload.customerAddressBusinessReference = nc.extractBusinessReferences(
        stub.channelProfile.customerAddressBusinessReferences,
        customerAddress
    );

    return stub.out;
}

async function validateArguments(stub) {
    nc.logInfo("Validating arguments...");
    const validationMessages = [];

    validationMessages.push(...validateNcUtil(stub.ncUtil));
    validationMessages.push(...validateChannelProfile(stub.channelProfile));
    validationMessages.push(...validatePayload(stub.payload));

    if (validationMessages.length > 0) {
        validationMessages.forEach(msg => nc.logError(msg));
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
    if (!nc.isObject(ncUtil)) {
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
        if (!nc.isNonEmptyArray(channelProfile.customerAddressBusinessReferences)) {
            messages.push(
                `The channelProfile.customerAddressBusinessReferences array is ${
                    channelProfile.customerAddressBusinessReferences == null ? "missing" : "invalid"
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

module.exports.InsertCustomerAddress = InsertCustomerAddress;
