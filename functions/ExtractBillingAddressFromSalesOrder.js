const nc = require("./util/ncUtils");

function ExtractBillingAddressFromSalesOrder(ncUtil, channelProfile, flowContext, payload, callback) {
    const stub = new nc.Stub("ExtractBillingAddressFromSalesOrder", ...arguments);

    nc.logInfo(`Beginning ${stub.name}...`);
    nc.validateCallback(callback);

    validateArguments(stub)
        .then(extractBillingAddress)
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

async function extractBillingAddress(stub) {
    nc.logInfo("Extracting billing address...");

    if (nc.isNonEmptyObject(stub.payload.doc.BillingAddress)) {
        stub.out.payload.doc = stub.payload.doc.BillingAddress;
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
        validationMessages.forEach(msg => logError(msg));
        stub.out.ncStatusCode = 400;
        throw new Error(`Invalid request [${validationMessages.join(" ")}]`);
    }

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
    }
    return messages;
}

function validateChannelSettingsValues(channelSettingsValues) {
    const messages = [];
    if (!nc.isObject(channelSettingsValues)) {
        messages.push(`The channelSettingsValues object is ${channelSettingsValues == null ? "missing" : "invalid"}.`);
    }

    return messages;
}

function validateChannelAuthValues(channelAuthValues) {
    const messages = [];
    if (!nc.isObject(channelAuthValues)) {
        messages.push(`The channelAuthValues object is ${channelAuthValues == null ? "missing" : "invalid"}.`);
    }

    return messages;
}

module.exports.ExtractBillingAddressFromSalesOrder = ExtractBillingAddressFromSalesOrder;
