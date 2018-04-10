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
function getClass(obj) {
  return Object.prototype.toString.call(obj).slice(8, -1);
}

function log(msg, level = "info", stubName) {
  if (isNonEmptyString(stubName)) {
    msg = `${stubName}: ${msg}`;
  }
  console.log(`[${level}] ${msg}`);
}

module.exports = {
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
  getClass,
  log
};
