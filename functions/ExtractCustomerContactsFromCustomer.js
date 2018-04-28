const nc = require("./util/ncUtils");

function ExtractCustomerContactsFromCustomer(ncUtil, channelProfile, flowContext, payload, callback) {
    const stub = new nc.Stub("ExtractCustomerContactsFromCustomer", ...arguments);

    nc.logInfo(`Beginning ${stub.name}...`);
    nc.validateCallback(callback);

    validateArguments(stub)
        .then(extractCustomerContactMethods)
        .catch(error => {
            nc.logError(error);

            stub.out.ncStatusCode = stub.out.ncStatusCode || 500;
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

async function extractCustomerContactMethods(stub) {
    nc.logInfo("Extracting customer contact methods...");

    if (nc.isNonEmptyArray(stub.payload.doc.ContactMethods)) {
        stub.out.payload = stub.payload.doc.ContactMethods.map(contactMethod => {
            return {
                doc: contactMethod,
                customerRemoteID: stub.payload.customerRemoteID,
                customerBusinessReference: stub.payload.customerBusinessReference
            };
        });
        stub.out.ncStatusCode = 200;
    } else {
        stub.out.ncStatusCode = 204;
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
        validationMessages.forEach(msg => nc.logError(msg));
        stub.out.ncStatusCode = 400;
        throw new Error(`Invalid request [${validationMessages.join(" ")}]`);
    }

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
        if (!nc.isNonEmptyArray(channelProfile.customerBusinessReferences)) {
            messages.push(`The channelProfile.customerBusinessReferences array is ${
                channelProfile.customerBusinessReferences == null ? "missing" : "invalid"
                }.`);
        }
    }
    return messages;
}

function validateChannelSettingsValues(channelSettingsValues) {
    const messages = [];
    if (!nc.isObject(channelSettingsValues)) {
        messages.push(`The channelSettingsValues object is ${channelSettingsValues == null ? "missing" : "invalid"}.`);
    }
    else {
        if (!nc.isNonEmptyString(channelSettingsValues.protocol)) {
            messages.push(`The channelSettingsValues.protocol string is ${
                channelSettingsValues.protocol == null ? "missing" : "invalid"
                }.`);
        }
        if (!nc.isString(channelSettingsValues.environment)) {
            messages.push(`The channelSettingsValues.environment string is ${
                channelSettingsValues.environment == null ? "missing" : "invalid"
                }.`);
        }
    }

    return messages;
}

function validateChannelAuthValues(channelAuthValues) {
    const messages = [];
    if (!nc.isObject(channelAuthValues)) {
        messages.push(`The channelAuthValues object is ${channelAuthValues == null ? "missing" : "invalid"}.`);
    }
    else {
        if (!nc.isNonEmptyString(channelAuthValues.company_id)) {
            messages.push(`The channelAuthValues.company_id string is ${
                channelAuthValues.company_id == null ? "missing" : "invalid"
                }.`);
        }
        if (!nc.isNonEmptyString(channelAuthValues.access_token)) {
            messages.push(`The channelAuthValues.access_token string is ${
                channelAuthValues.access_token == null ? "missing" : "invalid"
                }.`);
        }
    }

    return messages;
}

module.exports.ExtractCustomerContactsFromCustomer = ExtractCustomerContactsFromCustomer;
