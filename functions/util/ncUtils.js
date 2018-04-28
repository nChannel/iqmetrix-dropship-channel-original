let stubName;
function Stub(name, ncUtil, channelProfile, flowContext, payload, callback) {
    this.name = name;
    stubName = name;
    this.ncUtil = ncUtil;
    this.channelProfile = channelProfile;
    this.flowContext = flowContext;
    this.payload = payload;
    this.callback = callback;
    this.out = {
        ncStatusCode: null,
        response: {},
        payload: {}
    };
}

function isArray(obj) {
    return Array.isArray(obj);
}
function isEmptyArray(obj) {
    return isArray(obj) && obj.length === 0;
}
function isNonEmptyArray(obj) {
    return isArray(obj) && obj.length > 0;
}
function isString(obj) {
    return typeof obj === "string";
}
function isEmptyString(obj) {
    return isString(obj) && obj.trim().length === 0;
}
function isNonEmptyString(obj) {
    return isString(obj) && obj.trim().length > 0;
}
function isObject(obj) {
    return typeof obj === "object" && obj != null && !isArray(obj) && !isFunction(obj);
}
function isEmptyObject(obj) {
    return isObject(obj) && Object.keys(obj).length === 0;
}
function isNonEmptyObject(obj) {
    return isObject(obj) && Object.keys(obj).length > 0;
}
function isFunction(obj) {
    return typeof obj === "function";
}
function isNumber(obj) {
    return typeof obj === "number" && !isNaN(obj);
}
function isInteger(obj) {
    return isNumber(obj) && obj % 1 === 0;
}
function getClass(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

function extractBusinessReferences(businessReferences, doc, sep = ".") {
    const _get = require("lodash.get");

    if (!isArray(businessReferences)) {
        throw new TypeError("Error: businessReferences must be an Array.");
    } else if (!isObject(doc)) {
        throw new TypeError("Error: doc must be an object.");
    } else if (!(isString(sep) || sep === null)) {
        throw new TypeError("Error: when not null, sep must be a string.");
    }

    let values = [];

    // Get the businessReference
    businessReferences.forEach(function(businessReference) {
        values.push(_get(doc, businessReference));
    });

    if (sep === null) {
        return values;
    } else {
        return values.join(sep);
    }
}

function logInfo(msg) {
    log(msg, "info");
}

function logError(msg) {
    log(msg, "error");
}

function log(msg, level = "info") {
    if (isNonEmptyString(stubName)) {
        msg = `${stubName}: ${msg}`;
    }
    console.log(`[${level}] ${msg}`);
}

function validateCallback(cb) {
    if (!isFunction(cb)) {
        logError(`The callback function is ${cb == null ? "missing" : "invalid"}.`);
        if (cb == null) {
            throw new Error("A callback function was not provided");
        }
        throw new TypeError("callback is not a function");
    }
}

function validateNcUtil(ncUtil) {
    const messages = [];
    if (!isObject(ncUtil)) {
        messages.push(`The ncUtil object is ${ncUtil == null ? "missing" : "invalid"}.`);
    }
    return messages;
}

function validateFlowContext(flowContext) {
    const messages = [];

    return messages;
}

module.exports = {
    Stub,
    isArray,
    isEmptyArray,
    isNonEmptyArray,
    isString,
    isEmptyString,
    isNonEmptyString,
    isObject,
    isEmptyObject,
    isNonEmptyObject,
    isFunction,
    isNumber,
    isInteger,
    getClass,
    extractBusinessReferences,
    log,
    logInfo,
    logError,
    validateCallback,
    validateNcUtil,
    validateFlowContext
};
