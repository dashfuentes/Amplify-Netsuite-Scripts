/**
 * @author RSM US LLP
 * @file RSM_Core_v20.js
 * @version 2.0
 * @NApiVersion 2.0
 * @NModuleScope public
 * @module RSM_CR20
 */
(function(factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    } else if (typeof define === 'function' && define.amd) {
        define(['require', 'exports', 'N/util', 'N/log', 'N/error', 'N/format', 'N/runtime', 'N/record', 'N/search', 'N/task'], factory);
    }
})(function(require, exports) {
    'use strict';
    Object.defineProperty(exports, '__esModule', { value: true });
    var log = require('N/log');
    var util = require('N/util');
    var task = require('N/task');
    var error = require('N/error');
    var format = require('N/format');
    var record = require('N/record');
    var search = require('N/search');
    var runtime = require('N/runtime');
    /**
     * @exports RSM_CR20
     * @constructor
     */
    var rsm = (function() {
        /**
         * [Private objects]
         */

        /**
         * @description Possible NetSuite boolean values.
         * @type {array}
         * @private
         */
        const boolArray = [true, false, 'true', 'false', 'T', 'F', 1, 0];
        /**
         * @description Auxiliary counter
         * @type {number}
         * @private
         */
        var folderNameCount = 0;
        /**
         * @description Auxiliary folder name
         * @type {null|string}
         * @private
         */
        var originalFolderName = null;
        /**
         * @description Gets the script logging level for the current script execution.
         * @returns {string} Logging level.
         * @private
         */
        function getLogLevel() {
            return runtime.getCurrentScript().logLevel;
        }
        /**
         * @description createSubFolder: Creates a folder in the NetSuite file cabinet.
         * @param {string} _folderName Folder name
         * @param {number} _rootFolderId Folder internal Id
         * @param {boolean} [_isFirst=false] Is first iteration
         * @returns {number} Internal id of newly created folder.
         * @private
         */
        function createSubFolder(_folderName, _rootFolderId, _isFirst) {
            var folderId = -1;
            if (!rsm.isEmpty(_folderName)) {
                if (_isFirst) originalFolderName = _folderName;
                var folder = record.create({
                    type: record.Type.FOLDER,
                    isDynamic: false,
                    defaultValues: null
                }).setValue({
                    fieldId: 'name',
                    value: _folderName
                });
                if (!rsm.isEmpty(_rootFolderId)) folder.setValue({ fieldId: 'parent', value: _rootFolderId });
                try {
                    folderId = folder.save({
                        enableSourcing: true,
                        ignoreMandatoryFields: false
                    });
                } catch (error) {
                    if (!rsm.isEmpty(error.message) && error.message === 'A folder with the same name already exists in the selected folder.') {
                        folderNameCount++;
                        folderId = createSubFolder(originalFolderName + '_' + folderNameCount, _rootFolderId, false);
                    } else {
                        rsm.logError('Error while creating a folder in File Cabinet', error);
                    }
                }
            }
            return folderId;
        }
        /**
         * @description Gets saved search row result.
         * @param {object} _result search.Result object
         * @returns {object}
         * @private
         */
        function getSSRowResult(_result) {
            var colResult = {};
            if (Number(_result.id)) colResult.id = Number(_result.id);
            if (Number(_result.recordType)) colResult.recordType = _result.recordType;

            if (_result.columns && _result.columns.length > 0) {
                _result.columns.forEach(function(col, idx) {
                    var key = !rsm.isEmpty(col.join) ? col.name + '_' + col.join : col.name;
                    if (rsm.hasOwnProp(colResult, key)) key += '_' + idx;
                    colResult[key] = {
                        name: col.name,
                        label: col.label,
                        text: _result.getText(col) || '',
                        value: _result.getValue(col) || ''
                    };
                });
            }
            return colResult;
        }
        /**
         * @description Converts milliseconds to readable format as hh:mm:ss.
         * @param {number} _milliseconds Milliseconds
         * @returns {string}
         * @private
         */
        function millisecondToTime(_milliseconds) {
            var milliseconds = Math.floor((_milliseconds % 1000) * 1000) / 1000;
            var seconds = Math.floor(_milliseconds / 1000) % 60;
            var minutes = Math.floor(seconds / 60) % 60;
            var hours = Math.floor(minutes / 60) % 24;
            var time = [];
            time.push(hours.lpad(2, '0'));
            time.push(minutes.lpad(2, '0'));
            time.push(seconds.lpad(2, '0'));
            time.push(milliseconds.lpad(3, '0'));
            return time.join(':');
        }

        /**
         * [Public objects]
         */
        return {
            /**
             * @name dateFormat
             * @property {object} dateFormat
             * @property {string} dateFormat.date
             * @property {string} dateFormat.dateTime
             * @property {string} dateFormat.dateTimeTZ
             * @property {string} dateFormat.time
             * @memberof RSM_CR20
             * @readonly
             * @public
             */
            dateFormat: {
                date: format.Type.DATE,
                dateTime: format.Type.DATETIME,
                dateTimeTZ: format.Type.DATETIMETZ,
                time: format.Type.TIME
            },
            /**
             * @name logType
             * @property {object} logType
             * @property {string} logType.debug
             * @property {string} logType.audit
             * @property {string} logType.error
             * @property {string} logType.emergency
             * @memberof RSM_CR20
             * @readonly
             * @public
             */
            logType: {
                debug: 'DEBUG',
                audit: 'AUDIT',
                error: 'ERROR',
                emergency: 'EMERGENCY'
            },
            /**
             * @name noteType
             * @description Property for User Notes types
             * @property {object} noteType
             * @property {number} noteType.conferenceCall
             * @property {number} noteType.email
             * @property {number} noteType.fax
             * @property {number} noteType.letter
             * @property {number} noteType.meeting
             * @property {number} noteType.note
             * @property {number} noteType.phoneCall
             * @memberof RSM_CR20
             * @readonly
             * @public
             */
            noteType: {
                conferenceCall: 2,
                email: 3,
                fax: 4,
                letter: 5,
                meeting: 6,
                note: 7,
                phoneCall: 8
            },
            /**
             * @name noteRecordType
             * @description Property for User Notes records type
             * @property {object} noteRecordType
             * @property {string} noteRecordType.entity
             * @property {string} noteRecordType.transaction
             * @property {string} noteRecordType.customRecord
             * @memberof RSM_CR20
             * @readonly
             * @public
             */
            noteRecordType: {
                entity: 'entity',
                transaction: 'transaction',
                customRecord: 'recordtype'
            },
            /**
             * @name addressType
             * @description Property for Addresses types
             * @property {object} addressType
             * @property {object} addressType.entity
             * @property {string} addressType.entity.defaultShipping
             * @property {string} addressType.entity.defaultBilling
             * @property {string} addressType.entity.residential
             * @property {object} addressType.transaction
             * @property {string} addressType.transaction.shippingAddress
             * @property {string} addressType.transaction.billingAddress
             * @memberof RSM_CR20
             * @readonly
             * @public
             */
            addressType: {
                entity: {
                    defaultShipping: 'defaultshipping',
                    defaultBilling: 'defaultbilling',
                    residential: 'isresidential'
                },
                transaction: {
                    shippingAddress: 'shippingaddress',
                    billingAddress: 'billingaddress'
                }
            },
            /**
             * @name getDateType
             * @description Get JavaScript Data Types of a value
             * @param {*} _value Any
             * @returns {string|null|"undefined"|"object"|"boolean"|"number"|"string"|"function"|"symbol"|"bigint"}
             * @memberof RSM_CR20
             * @public
             */
            getDataType: function(_value) {
                if (_value && (typeof _value === 'string' || _value instanceof String)) return typeof _value;
                else if (_value && (typeof _value === 'number' && isFinite(_value))) return typeof _value;
                else if (_value && (typeof _value === 'object' && _value.constructor === Array)) return 'array';
                else if (_value && (typeof _value === 'object' && _value.constructor === Object)) return 'object';
                else if (_value && (typeof _value === 'object' && _value.constructor === RegExp)) return 'regexp';
                else if (_value && (_value instanceof Function)) return 'function';
                else if (_value && (_value instanceof Error && typeof _value.message !== 'undefined')) return 'error';
                else if (_value && (_value instanceof Date)) return 'date';
                else if (_value === null) return null;
                else return typeof _value;
            },
            /**
             * @name isArray
             * @param {*} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isArray: function(_value) { return rsm.getDataType(_value) === 'array'; },
            /**
             * @name isFunc
             * @param {*} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isFunc: function(_value) { return typeof (_value) == 'function'; },
            /**
             * @name isBoolean
             * @description Validates if variable is a NetSuite boolean type
             * @example
             * rsm.isBoolean(undefined); // false
             * rsm.isBoolean(null); // false
             * rsm.isBoolean(true); // true
             * rsm.isBoolean(false); // true
             * rsm.isBoolean('true'); // true
             * rsm.isBoolean('false'); // true
             * rsm.isBoolean('T'); // true
             * rsm.isBoolean('F'); // true
             * rsm.isBoolean(0); // true
             * rsm.isBoolean(1); // true
             * @param {*} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isBoolean: function(_value) {
                if (typeof _value === 'undefined' || _value === null) return false;
                return boolArray.indexOf(_value) > -1;
            },
            /**
             * @name isCurrency
             * @description Validates if a string is a currency
             * @example
             * rsm.isCurrency("$1,530,602.24"); // true
             * rsm.isCurrency("1,530,602.24"); // true
             * rsm.isCurrency("1,666,88"); // false
             * @param {string} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isCurrency: function(_value) {
                if (rsm.isEmpty(_value) || isNaN(Number(_value))) return false;
                return !!_value.match(/(?=.*\d)^\$?(([1-9]\d{0,2}(,\d{3})*)|0)?(\.\d{1,2})?$/);
            },
            /**
             * @name isEmpty
             * @description Validates if a variable has null or empty value
             * @example
             * rsm.isEmpty(undefined); // true
             * rsm.isEmpty(null); // true
             * rsm.isEmpty(''); // true
             * rsm.isEmpty([]); // true
             * rsm.isEmpty({}); // true
             * @param {*} _value Any
             * @returns {boolean} Return true if the variable is null or empty
             * @memberof RSM_CR20
             * @public
             */
            isEmpty: function(_value) {
                if (typeof _value === 'undefined' || _value === null) return true;
                if (typeof _value === 'string' || _value instanceof String) return _value.trim().length === 0;
                if (typeof _value === 'object' && _value.constructor === Array) return _value.length === 0;
                if (typeof _value === 'object' && _value.constructor === Object) {
                    if (Object.getOwnPropertyNames) {
                        return Object.getOwnPropertyNames(_value).length === 0;
                    } else {
                        for (var key in _value) {
                            if (rsm.hasOwnProp(_value, key)) return false;
                        }
                        return true;
                    }
                }
                return false;
            },
            /**
             * @name isEqual
             * @description Perform strict comparison
             * @example
             * rsm.isEqual(100, "100"); // false
             * rsm.isEqual(100, 100); // true
             * @param {*} _valueA Any
             * @param {*} _valueB Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isEqual: function(_valueA, _valueB) {
                // 'null' or 'undefined' only equal to itself (strict comparison).
                if (_valueA == null || _valueB == null) return false;
                // Identical objects are equal. '0 === -0', but they aren't identical.
                if (_valueA === _valueB) return _valueA !== 0 || 1 / _valueA === 1 / _valueB;
                // Exhaust primitive checks
                var type = typeof _valueA;
                if (type !== 'function' && type !== 'object' && typeof _valueB !== 'object') return false;
            },
            /**
             * @name isError
             * @description Checks if argument is a NetSuite Error
             * @param {*} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isError: function(_value) {
                return !rsm.isEmpty(_value) && (_value.constructor === Error || _value.constructor.name === 'SuiteScriptError' || _value.constructor.name === 'UserEventError');
            },
            /**
             * @name isObject
             * @param {*} _value Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isObject: function(_value) { return rsm.getDataType(_value) === 'object'; },
            /**
             * @name isUndefined
             * @param {*} _input Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isUndefined: function(_input) { return _input === void 0; },
            /**
             * @name isNumber
             * @param {*} _input Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isNumber: function(_input) { return typeof _input === 'number' || Object.prototype.toString.call(_input) === '[object Number]'; },
            /**
             * @name isDate
             * @param {*} _input Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            isDate: function(_input) { return _input instanceof Date || Object.prototype.toString.call(_input) === '[object Date]'; },
            /**
             * @name hasOwnProp
             * @param {Object} _object Object
             * @param {string} _key Key
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            hasOwnProp: function(_object, _key) { return Object.prototype.hasOwnProperty.call(_object, _key); },
            /**
             * @description Parses an argument and returns a boolean
             * @param {boolean|string|number} _boolean Any
             * @returns {boolean}
             * @memberof RSM_CR20
             * @public
             */
            parseBoolean: function(_boolean) {
                return rsm.isBoolean(_boolean) ? (rsm.isEqual(_boolean, true) || rsm.isEqual(_boolean, 'true') ||
                    rsm.isEqual(_boolean, 'T') || rsm.isEqual(_boolean, 1)) : false;
            },
            /**
             * @description Sets a default value is passed values is null or empty.
             * @param {*} _value Any
             * @param {*} _defaultValue Any
             * @returns {*}
             * @example
             * var str;
             * var nStr = rsm.setDefault(str, "hello"); // hello
             * @memberof RSM_CR20
             * @public
             */
            setDefault: function(_value, _defaultValue) {
                if (_defaultValue === void 0) throw new Error('Default value argument is required');
                return rsm.isEmpty(_value) ? _defaultValue : _value;
            },
            /**
             * @description This function tries to parse an input to float, otherwise, returns defined default value.
             * @param {*} _number Any
             * @param {number} [_defaultNumber=0] Any value number
             * @returns {number}
             * @example
             * rsm.toNumber("12.5"); // 12.5
             * rsm.toNumber("12.A"); // 12
             * @memberof RSM_CR20
             * @public
             */
            toNumber: function(_number, _defaultNumber) {
                return isNaN(parseFloat(_number)) ? rsm.setDefault(_defaultNumber, 0) : parseFloat(_number);
            },
            /**
             * @description Takes a string representation of a percentage and returns it a decimal representation.
             * @param  {string} _strPercent Percent expresion
             * @returns {number}
             * @example
             * rsm.percentToNumber("25%"); // 0.25
             * @memberof RSM_CR20
             * @public
             */
            percentToNumber: function(_strPercent) {
                if (rsm.isEmpty(_strPercent) || _strPercent.indexOf('%') === -1) return 0.0;
                var value = _strPercent.split('%');
                return Number((parseFloat(value[0]) / 100).toFixed(6));
            },
            /**
             * @description Takes a decimal representation of a percentage and returns a string representation.
             * @param {number} _numPercent Any decimal number
             * @returns {string}
             * @example
             * rsm.decimalToPercent(0.656); // 65.6%
             * @memberof RSM_CR20
             * @public
             */
            decimalToPercent: function(_numPercent) {
                return rsm.isEmpty(_numPercent) ? '0.0%' : (_numPercent * 100).toFixed(1) + '%';
            },
            /**
             * @description Gets the Item record type
             * @param {string|number} _itemId Item internal Id
             * @returns {string}
             * @memberof RSM_CR20
             * @public
             */
            getItemRecordType: function(_itemId) {
                var fieldLookUp = search.lookupFields({
                    type: search.Type.ITEM,
                    id: _itemId,
                    columns: ['type']
                });
                var itemType = rsm.setDefault(fieldLookUp.type[0].value, '');
                switch (itemType) {
                    case 'Assembly': return record.Type.ASSEMBLY_ITEM;
                    case 'Description': return record.Type.DESCRIPTION_ITEM;
                    case 'Discount': return record.Type.DISCOUNT_ITEM;
                    case 'DwnLdItem': return record.Type.DOWNLOAD_ITEM;
                    case 'GiftCert': return record.Type.GIFT_CERTIFICATE_ITEM;
                    case 'Group': return record.Type.ITEM_GROUP;
                    case 'InvtPart': return record.Type.INVENTORY_ITEM;
                    case 'Kit': return record.Type.KIT_ITEM;
                    case 'Markup': return record.Type.MARKUP_ITEM;
                    case 'NonInvtPart': return record.Type.NON_INVENTORY_ITEM;
                    case 'OthCharge': return record.Type.OTHER_CHARGE_ITEM;
                    case 'Payment': return record.Type.PAYMENT_ITEM;
                    case 'Service': return record.Type.SERVICE_ITEM;
                    case 'ShipItem': return record.Type.SHIP_ITEM;
                    case 'Subtotal': return record.Type.SUBTOTAL_ITEM;
                    case 'TaxGroup': return record.Type.SHIP_ITEM;
                    case 'TaxItem': return record.Type.SHIP_ITEM;
                    default: return itemType;
                }
            },
            /**
             * @description Makes sure to return the given argument as an Array.
             * Also verifies if any of these symbols exist in the expression  [-|:;,./] if so,
             * it split the expression by the first occurrence of the symbol.
             * @param {*} _value Any
             * @returns {Array|null}
             * @example
             * rsm.getAsArray("154,10254,2548"); // ["154","10254","2548"]
             * rsm.getAsArray("09/15/2019"); // ["09","15","2019"]
             * rsm.getAsArray("hello"); // ["hello"]
             * rsm.getAsArray(150.65); // ["150","65"]
             * @memberof RSM_CR20
             * @public
             */
            getAsArray: function(_value) {
                if (rsm.isEmpty(_value)) return null;
                if (util.isArray(_value)) return _value;
                else {
                    var match = String(_value).match(/[-|:;,./]/gmi);
                    if (match && (match[0] !== void 0)) {
                        var chr = match[0];
                        return String(_value).split(chr);
                    } else return [_value];
                }
            },
            /**
             * @description Splits given array in chunks.
             * @param {array} _array Array
             * @param {number} _chunkSize Integer
             * @returns {array}
             * @memberof RSM_CR20
             * @public
             */
            chunkArray: function(_array, _chunkSize) {
                if (_chunkSize === void 0) throw new Error('Chunk Size argument is required');
                return _array.slice(0, (_array.length + _chunkSize - 1) / _chunkSize | 0).map(function(c, i) {
                    return _array.slice(_chunkSize * i, _chunkSize * i + _chunkSize);
                });
            },
            /**
             * @description Converts an array to object
             * @param {array} _array Array
             * @returns {object}
             * @example
             * rsm.arrayToObject(['John', 'Matt', 'Luke']); // {0: "John", 1: "Matt", 2: "Luke"}
             * @memberof RSM_CR20
             * @public
             */
            arrayToObject: function(_array) {
                if (rsm.isArray(_array)) {
                    return _array.reduce(function(acc, cur, i) {
                        acc[i] = cur;
                        return acc;
                    }, {});
                }
                return {};
            },
            /**
             * @description This method returns the key of the first element `predicate` returns truthy for instead of the element itself.
             * @param {Object} _object The object to inspect.
             * @param {Function} _predicate The function invoked per iteration.
             * @returns {string|undefined} Returns the key of the matched element, else `undefined`.
             * @see lodash https://github.com/lodash/lodash/blob/a0a3a6af910e475d8dd14dabc452f957e436e28b/findKey.js
             * @example
             * const users = {
             *   'John': { 'age': 36, 'active': true },
             *   'Matt': { 'age': 40, 'active': false },
             *   'Luke': { 'age': 21, 'active': true }
             * }
             * rsm.findKey(users, function(o){return o.age === 40}); // Matt
             * @memberof RSM_CR20
             * @public
             */
            findKey: function(_object, _predicate) {
                var result;
                if (rsm.isEmpty(_object)) return undefined;
                result = undefined;
                _object = Object(_object);
                Object.keys(_object).some(function(key) {
                    const value = _object[key];
                    if (_predicate(value, key, _object)) {
                        result = key;
                        return true;
                    } else return false;
                });
                return result;
            },
            /**
             * @description This method returns the value of the first element `predicate` returns truthy for instead of the element itself.
             * @param {Object} _object The object to inspect.
             * @param {Function} _predicate The function invoked per iteration.
             * @returns {Array} Returns the new matched element array.
             * @example
             * const users = {
             *   'John': { 'age': 36, 'active': true },
             *   'Matt': { 'age': 40, 'active': false },
             *   'Luke': { 'age': 21, 'active': true }
             * }
             * rsm.findValue(users, function(o){return o.age === 40}); // { 'age': 40, 'active': false }
             * @memberof RSM_CR20
             * @public
             */
            findValue: function(_object, _predicate) {
                var result;
                if (rsm.isEmpty(_object)) return undefined;
                result = undefined;
                _object = Object(_object);
                Object.keys(_object).some(function(key) {
                    const value = _object[key];
                    if (_predicate(value, key, _object)) {
                        result = value;
                        return true;
                    } else return false;
                });
                return result;
            },
            /**
             * @description Iterates over properties of `object`, returning an array of all elements `predicate` returns truthy for.
             * @param {Object} _object The object to iterate over.
             * @param {Function} _predicate The function invoked per iteration.
             * @returns {Array} Returns the new filtered array.
             * @see lodash https://github.com/lodash/lodash/blob/a0a3a6af910e475d8dd14dabc452f957e436e28b/filterObject.js
             * @example
             * const users = {
             *   'John': { 'age': 36, 'active': true },
             *   'Matt': { 'age': 40, 'active': false },
             *   'Luke': { 'age': 21, 'active': true }
             * }
             * rsm.filterObject(users, function(o){return o.active;});
             * // [{"age":36,"active":true},{"age":21,"active":true}]
             * @memberof RSM_CR20
             * @public
             */
            filterObject: function(_object, _predicate) {
                var result = [];
                if (rsm.isEmpty(_object)) return result;
                _object = Object(_object);
                Object.keys(_object).forEach(function(key) {
                    const value = _object[key];
                    if (_predicate(value, key, _object)) result.push(value);
                });
                return result;
            },
            /**
             * @description Function to get current or given date in format accepted by NetSuite.
             * @param {object} [_arg] Any
             * @param {Date|string|number} [_arg.value] Date or String or Integer value representing the number of milliseconds since January 1, 1970, 00:00:00 UTC.
             * @param {string} [_arg.format] Any of rsm.dateFormat enum value
             * @returns {string}
             * @memberof RSM_CR20
             * @public
             */
            getDate: function(_arg) {
                var value;
                if (!rsm.isEmpty(_arg) && !rsm.isEmpty(_arg.value) && (_arg.value instanceof Date)) value = _arg.value;
                else value = rsm.isEmpty(_arg) || rsm.isEmpty(_arg.value) ? new Date() : new Date(_arg.value);
                return format.format({
                    value: value,
                    type: rsm.isEmpty(_arg) || rsm.isEmpty(_arg.format) ? rsm.dateFormat.date : _arg.format
                });
            },
            /**
             * @description Gets a UNIX timestamp style.
             * @param {Date|string|number} [_arg] Date or String or Integer value representing the number of milliseconds since January 1, 1970, 00:00:00 UTC.
             * @returns {string}
             * @example
             * var timestamp = rsm.getEpochTimestamp(); // 1568306304
             * @memberof RSM_CR20
             * @public
             */
            getEpochTimestamp: function(_arg) {
                var date = rsm.isEmpty(_arg) ? new Date() : new Date(_arg);
                return Math.floor(date.getTime() / 1000.0).toString();
            },
            /**
             * @description Convert an epoch timestamp to human-readable date
             * @param {string|number}_epochDate Integer representation of Epoch
             * @param {object} [_format] Format type
             * @param {string} [_format.date] Convert to date
             * @param {string} [_format.dateTime] Convert to date-time
             * @param {string} [_format.time] Convert to time
             * @param {string} [_format.dateTimeTZ] Convert to date-time-zone
             * @returns {string|number}
             * @example
             * var timestamp = '1568307804';
             * rsm.convertEpochToDate(timestamp, rsm.dateFormat.dateTimeTZ); // 9/12/2019 12:03:24 pm
             * @memberof RSM_CR20
             * @public
             */
            convertEpochToDate: function(_epochDate, _format) {
                if (!rsm.isEmpty(_epochDate)) return rsm.getDate({ value: Number(_epochDate) * 1000 });
                else return '';
            },
            /**
             * @description Generates a GUID string.
             * @returns {string}
             * @example
             * var guid = rsm.guid(); // af8a8416-6e18-a307-bd9c-f2c947bbb3aa
             * @memberof RSM_CR20
             * @public
             */
            guid: function() {
                /**
                 * @param {boolean} [_addDash] Indicates to add dash character
                 * @returns {string}
                 */
                function part(_addDash) {
                    if (_addDash === void 0) _addDash = false;
                    var p = (Math.random().toString(16) + '000000000').substr(2, 8);
                    return _addDash ? '-' + p.substr(0, 4) + '-' + p.substr(4, 4) : p;
                }
                return part() + part(true) + part(true) + part();
            },
            /**
             * @description createFolder: Creates a folder in the NetSuite file cabinet.
             * @see Governance usage: 15 units.
             * @param {string} _folderName Name of folder to create.
             * @param {number} [_rootFolderId] If creating a sub-folder, the root folder to create in.
             * Leave this value null if you want to create your folder in the root NetSuite file cabinet.
             * @returns {number} Internal id of newly created folder.
             * @memberof RSM_CR20
             * @public
             */
            createFolder: function(_folderName, _rootFolderId) {
                folderNameCount = 0;
                return createSubFolder(_folderName, _rootFolderId, true);
            },
            /**
             * @description Gets a value for the usage units remaining for the currently executing script.
             * @see Supported client and server-side scripts.
             * @returns {number}
             * @memberof RSM_CR20
             * @public
             */
            getRemainingUsage: function() {
                return runtime.getCurrentScript().getRemainingUsage();
            },
            /**
             * @description Reschedules the current script
             * @param {object} _params - Key/Value parameters
             * @memberof RSM_CR20
             * @public
             */
            rescheduleScript: function(_params) {
                var taskId = task.create({
                    taskType: task.TaskType.SCHEDULED_SCRIPT,
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    params: _params
                }).submit();
                rsm.log('SCHEDULED_SCRIPT re-scheduled', taskId, rsm.logType.audit);
            },
            /**
             * @description Calculates the usage units for the currently executing routine.
             * @see Supported client and server-side scripts.
             * @param {number} _initialUsage Current usage point
             * @returns {number}
             * @memberof RSM_CR20
             * @public
             */
            calculateUsage: function(_initialUsage) {
                return _initialUsage - rsm.getRemainingUsage();
            },
            /**
             * @description Logs script execution details.
             * @param {*} _title String to appear in the Title column on the Execution Log tab of the script deployment.
             * @param {*} _details Any value for this parameter.
             * @param {string} [_logLevel=rsm.logType.debug] Logging level. {debug: 'DEBUG', audit: 'AUDIT', emergency: 'EMERGENCY', error: 'ERROR'}
             * @memberof RSM_CR20
             * @public
             */
            log: function(_title, _details, _logLevel) {
                var details = rsm.setDefault(_details, '');
                var loglevel;
                if (rsm.isEmpty(_logLevel)) {
                    // Always default 'debug' even though the script Log Level has been set Error/Emergency to avoid false error messages.
                    if ([rsm.logType.error, rsm.logType.emergency].indexOf(getLogLevel()) > -1) loglevel = rsm.logType.debug;
                    else loglevel = getLogLevel();
                } else loglevel = _logLevel;
                if (rsm.isError(_details)) {
                    details = 'Name: ' + _details.name + '\nMessage: ' + _details.message + '\n';
                    if (!rsm.isEmpty(_details.eventType)) details += 'User Event Type:: ' + _details.eventType + '\n';
                    if (!rsm.isEmpty(_details.recordId)) details += 'Submitted Record ID: ' + _details.recordId + '\n';
                    if (!rsm.isEmpty(_details.cause)) details += 'Code: ' + _details.cause.code + '\nUser Event: ' + _details.cause.userEvent + '\n';
                    if (!rsm.isEmpty(_details.stack)) {
                        details += 'Stack Trace:\n';
                        _details.stack.forEach(function(element) {
                            details += element + '\n';
                        });
                    }
                    if (!rsm.isEqual(loglevel, rsm.logType.error)) loglevel = rsm.logType.error;
                }
                var options = {
                    title: rsm.setDefault(_title, ''),
                    details: details,
                    notifyOff: true
                };
                switch (loglevel) {
                    case rsm.logType.debug: log.debug(options);
                        break;
                    case rsm.logType.audit: log.audit(options);
                        break;
                    case rsm.logType.error: log.error(options);
                        break;
                    case rsm.logType.emergency: log.emergency(options);
                        break;
                }
            },
            /**
             * @description Logs NS and custom error
             * @param {string} _title Title
             * @param {*|error} _details Any
             * @memberof RSM_CR20
             * @public
             */
            logError: function(_title, _details) {
                rsm.log(_title, _details, rsm.logType.error);
            },
            /**
             * @description Throw error
             * @param {string|Error} _errorCode User-defined error code
             * @param {string} _errorMessage Error message text displayed in the Details column of the Execution Log.
             * @memberof RSM_CR20
             * @public
             */
            throwError: function(_errorCode, _errorMessage) {
                var errorObj = error.create({ name: _errorCode, message: _errorMessage, notifyOff: true });
                rsm.logError('Error', errorObj);
                throw errorObj;
            },
            /**
             * @description Returns error caught in a RESTlet.
             * @param {object|string} _error An error.SuiteScriptError object
             * @returns {object}
             * @example
             * {
             *   "error": {
             *     "code": "RCRD_NOT_FOUND",
             *     "message": "RMA ID: 307257, not found"
             *   }
             * }
             * @memberof RSM_CR20
             * @public
             */
            errorResponse: function(_error) {
                var error = {};
                if (rsm.isError(_error)) {
                    error.code = _error.name.toUpperCase();
                    error.message = _error.message;
                } else {
                    error.code = 'UNEXPECTED_ERROR';
                    error.message = _error.toString();
                }
                return error;
            },
            /**
             * @description Adds User Notes to records
             * @param {object} _userNoteArgs Note argument properties
             * @param {string} _userNoteArgs.recordType rsm.noteRecordType enum
             * @param {number} [_userNoteArgs.customRecordId] Custom record internal Id,
             * @param {string|number} _userNoteArgs.recordId Entity/Transaction/Custom record internal Id.
             * @param {number} [_userNoteArgs.type] { SystemLoggedNote: 1, ConferenceCall: 2, Email: 3, Fax: 4, Letter: 5, Meeting: 6, Note: 7, PhoneCall: 8}
             * @param {string} _userNoteArgs.title Custom title.
             * @param {string} _userNoteArgs.note Custom note/memo.
             * @memberof RSM_CR20
             * @public
             */
            addUserNote: function(_userNoteArgs) {
                if ((typeof _userNoteArgs !== 'undefined') && util.isObject(_userNoteArgs)) {
                    try {
                        if ((rsm.isEqual(_userNoteArgs.recordType, rsm.noteRecordType.CustomRecord) && _userNoteArgs.customRecordId && _userNoteArgs.recordId) ||
                            (!rsm.isEmpty(_userNoteArgs.recordType) && _userNoteArgs.recordId)) {
                            var userNote = record.create({ type: record.Type.NOTE });
                            if (rsm.isEqual(_userNoteArgs.recordType, rsm.noteRecordType.CustomRecord)) {
                                userNote.setValue({ fieldId: 'recordtype', value: _userNoteArgs.customRecordId });
                                userNote.setValue({ fieldId: 'record', value: parseInt(_userNoteArgs.recordId) });
                            } else userNote.setValue({ fieldId: _userNoteArgs.recordType, value: parseInt(_userNoteArgs.recordId) });
                            userNote.setValue({ fieldId: 'notetype', value: rsm.setDefault(_userNoteArgs.type, rsm.noteType.Note) });
                            userNote.setValue({ fieldId: 'title', value: _userNoteArgs.title });
                            userNote.setValue({ fieldId: 'note', value: _userNoteArgs.note });
                            userNote.save();
                            rsm.log('User Note Added', _userNoteArgs.note);
                        }
                    } catch (e) {
                        rsm.logError('Error Adding User Note', e);
                    }
                }
            },
            /**
             * @typedef {Object} getSSResults_return
             * @property {Array} results
             * @property {Object} summary
             * @property {number} summary.total
             * @property {number} summary.totalUsage
             * @property {string} summary.elapsedTime
             * @description Retrieves all or a specific number of row records from a search object (search.create or search.load).
             * @param {Object|string} _searchObjOrId - The saved search ID or search.create object.
             * @param {number} [_maxResult=1000] From 1 to 1,000.
             * @returns {getSSResults_return}
             * @memberof RSM_CR20
             * @public
             */
            getSSResults: function(_searchObjOrId, _maxResult) {
                var searchResults = [];
                var initialTime = new Date();
                var initialUsage = rsm.getRemainingUsage();
                try {
                    var searchObj;
                    if (util.isString(_searchObjOrId)) searchObj = search.load({ id: _searchObjOrId });
                    else if (typeof _searchObjOrId === 'object') searchObj = _searchObjOrId;
                    if (!rsm.isEmpty(searchObj)) {
                        if (_maxResult === void 0) {
                            // Get all results
                            var pagedData = searchObj.runPaged({ pageSize: 1000 });
                            pagedData.pageRanges.forEach(function(pageRange) {
                                var page = pagedData.fetch({ index: pageRange.index });
                                page.data.forEach(function(result) {
                                    searchResults.push(getSSRowResult(result));
                                }, []);
                            });
                        } else {
                            // Get restricted numbers of results
                            var results = searchObj.run().getRange({ start: 0, end: _maxResult.between(1, 1000) });
                            results.forEach(function(result) {
                                searchResults.push(getSSRowResult(result));
                            }, []);
                        }
                    }
                } catch (e) {
                    rsm.throwError('SSS_INVALID_USAGE', e.message);
                }
                return {
                    results: searchResults,
                    summary: {
                        total: util.isArray(searchResults) ? searchResults.length : rsm.isEmpty(searchResults) ? 0 : 1,
                        totalUsage: rsm.calculateUsage(initialUsage),
                        elapsedTime: millisecondToTime(new Date() - initialTime)
                    }
                };
            },
            /**
             * @description Get a NS List as a key/value object.
             * @param {string} _listId The List Id. Example: 'customlist_status'.
             * @param {boolean} [_useLowerCase=false] Lowercase the key of resultant object
             * @returns {object}
             * @example
             * var listObj = rsm.getListAsObject('customlist_maintenancestatus');
             * // {"Completed":4,"Failed":5,"InProgress":3,"NotStarted":1,"Waiting":2}
             * @memberof RSM_CR20
             * @public
             */
            getListAsObject: function(_listId, _useLowerCase) {
                var list = {};
                var useLoweCase = rsm.parseBoolean(_useLowerCase);
                if (!rsm.isEmpty(_listId)) {
                    var resultsObj = rsm.getSSResults(search.create({ type: _listId, columns: [{ name: 'name' }] }));
                    resultsObj.results.forEach(function(result) {
                        var nameObj = result.name;
                        var name = (useLoweCase) ? nameObj.value.replace(/[^\w\d]/gi, '').toLowerCase() : nameObj.value.toCamelCase();
                        list[name] = Number(result.id);
                    });
                }
                return list;
            },
            /**
             * @description Creates file string used to create CSV file with N/file file.create
             * @param {Array} _searchResults - Return from rsm.getSSResults()
             * @returns {string} fileString - String of CSV file contents
             * @memberof RSM_CR20
             * @public
             */
            getSearchAsCSV: function(_searchResults) {
                var fileContents = [];
                var rowData = [];
                var resultColumns = Object.keys(_searchResults[0]);
                var numColumns = resultColumns.length;

                var headers = getHeaders(_searchResults);
                fileContents.push(headers);

                _searchResults.forEach(function(result) {
                    rowData = [];
                    for (var y = 0; y < numColumns; y++) {
                        var rowVal = (resultColumns[y] === 'id') ? (result[resultColumns[y]]).toString() : result[resultColumns[y]].value;
                        rowData.push(rowVal.replace(/[,.]+/g, ""));
                    }
                    fileContents.push(rowData);
                });

                var fileString = '';
                var numRows = fileContents.length;
                var row;

                for (var i = 0; i < numRows; i++) {
                    row = fileContents[i];
                    fileString += row.join(',');
                    if (i !== numRows - 1) {
                        fileString += '\n';
                    }
                }

                return fileString;

                /**
                 * @description Gets labels from each search column to display as the first row in the created CSV file
                 *
                 * @param {Array} searchResults - rsm.getSSResults() results array
                 * @returns {Array} - Contains first row (Column Headers) to display in the created CSV file
                 */
                function getHeaders(searchResults) {
                    var headers = [];
                    var label;
                    var name;

                    for (var j = 0; j < numColumns; j++) {
                        label = searchResults[0][resultColumns[j]].label;
                        name = searchResults[0][resultColumns[j]].name;
                        headers.push((label) ? label : name);
                    }

                    return headers;
                }
            },
            /**
             * @description Returns an object with all sublist fields values from a single line.
             * @param {object} _recordObj Record object.
             * @param {string} _sublistId Sublist Id.
             * @param {array} [_fieldsWhiteList];
             * @returns {object}
             * @memberof RSM_CR20
             * @public
             */
            getSublistData: function(_recordObj, _sublistId, _fieldsWhiteList) {
                var sublistArr = [];
                var count = _recordObj.getLineCount(_sublistId);
                for (var line = 0; line < count; line++) {
                    var data = {};
                    var sublistFields = _recordObj.getSublistFields(_sublistId);
                    sublistFields.forEach(function(fieldId) {
                        var objField = _recordObj.getSublistField({ sublistId: _sublistId, fieldId: fieldId, line: line });
                        if (objField) {
                            if (rsm.isEmpty(_fieldsWhiteList)) {
                                data[objField.id] = {
                                    type: objField.type,
                                    label: objField.label,
                                    text: _recordObj.getSublistText({ sublistId: _sublistId, fieldId: fieldId, line: line }) || '',
                                    value: _recordObj.getSublistValue({ sublistId: _sublistId, fieldId: fieldId, line: line })
                                };
                            } else if (_fieldsWhiteList.indexOf(fieldId) > -1) {
                                data[objField.id] = {
                                    type: objField.type,
                                    label: objField.label,
                                    text: _recordObj.getSublistText({ sublistId: _sublistId, fieldId: fieldId, line: line }) || '',
                                    value: _recordObj.getSublistValue({ sublistId: _sublistId, fieldId: fieldId, line: line })
                                };
                            }
                        }
                    });
                    if (!rsm.isEmpty(data)) {
                        data.index = line;
                        sublistArr.push(data);
                    }
                }
                return sublistArr;
            },
            /**
             * @name startBenchmark
             * @description Generates benchmark start date and logs to AUDIT log.
             * @param {string} [_event=''] Title/event name
             * @returns {{startUsage: number, startDateTime: Date}} Returns benchmark starting date and remaining usage as object.
             * @memberof RSM_CR20
             * @public
             */
            startBenchmark: function(_event) {
                var startDateTime = new Date();
                rsm.log('Benchmark started. ' + rsm.setDefault(_event, ''), rsm.getDate({ value: startDateTime, format: rsm.dateFormat.dateTimeTZ }), rsm.logType.audit);
                return { startDateTime: startDateTime, startUsage: rsm.getRemainingUsage() };
            },
            /**
             * @name endBenchmark
             * @description Generates benchmark end date and logs to AUDIT log. If a start date is passed in, the total elapsed time is also calculated.
             * @param {string} [_event=''] Title/event name
             * @param {object} _benchmarkObj { startDateTime: {Date}, startUsage: {number} }
             * @param {Date} _benchmarkObj.startDateTime DateTime
             * @param {number} _benchmarkObj.startUsage Initial Usage
             * @memberof RSM_CR20
             * @public
             */
            endBenchmark: function(_event, _benchmarkObj) {
                var endDateTime = new Date();
                var elapsedTime = null;
                if (!rsm.isEmpty(_benchmarkObj.startDateTime)) elapsedTime = millisecondToTime(endDateTime - _benchmarkObj.startDateTime);
                var details = rsm.getDate({ value: endDateTime, format: rsm.dateFormat.dateTimeTZ }) +
                    '. Elapsed Time: ' + rsm.setDefault(elapsedTime, '') +
                    '. Total Usage: ' + (_benchmarkObj.startUsage - rsm.getRemainingUsage());
                rsm.log('Benchmark ended. ' + rsm.setDefault(_event, ''), details, rsm.logType.audit);
            },
            /**
             * @name scriptHandler
             * @description Base script structure definition to be used on script starters.
             * @param {object} _args
             * @param {object} _args.context Script Context.
             * @param {string} _args.entryPoint Script entry point.
             * @param {object} _args.args Script Context Properties.
             * @param {object} [_args.args.currentRecord]
             * @param {object} [_args.args.newRecord]
             * @param {object} [_args.args.oldRecord]
             * @param {string} [_args.args.sublistId]
             * @param {string} [_args.args.fieldId]
             * @param {number} [_args.args.lineNum]
             * @param {number} [_args.args.columnNum]
             * @param {string} [_args.args.mode]
             * @param {string} [_args.args.type]
             * @param {object} [_args.args.form]
             * @param {object} [_args.args.request]
             * @param {object} [_args.args.response]
             * @param {array} [_args.params] Script parameters.
             * @type {scriptHandler}
             * @namespace scriptHandler
             * @memberof RSM_CR20
             * @class
             * @public
             */
            scriptHandler: (function() {
                /**
                 * @description Script handler constructor
                 * @param {object} _args;
                 * @param {object} _args.context; Script Context.
                 * @param {string} _args.entryPoint; Script entry point.
                 * @param {object} _args.args;
                 * @param {array} [_args.params]; Script parameters.
                 * @constructor
                 * @public
                 */
                function scriptHandler(_args) {
                    this.executionContext = runtime.executionContext;
                    this.context = rsm.setDefault(_args.context, null);
                    this.entryPoint = rsm.setDefault(_args.entryPoint, '');
                    this.args = rsm.setDefault(_args.args, {});
                    this.params = {};
                    this.allowDelete = true;
                    this.allowFieldChange = true;
                    this.allowLineChange = true;
                    this.allowLineInsert = true;
                    this.allowSave = true;
                    this.RESTletReturn = null;
                    getParams(this.params, rsm.setDefault(_args.params, []));
                }
                /**
                 * @description Run all modules passed in.
                 * @param {array} _modules Modules array
                 * @memberof RSM_CR20.scriptHandler
                 * @public
                 */
                scriptHandler.prototype.run = function(_modules) {
                    rsm.log(this.entryPoint + ' started', rsm.getDate({ format: rsm.dateFormat.dateTimeTZ }), rsm.logType.audit);
                    _modules.forEach(function(module) {
                        var benchmark = rsm.startBenchmark(module.name);
                        module();
                        rsm.endBenchmark(module.name, benchmark);
                    });
                    rsm.log(this.entryPoint + ' ended', rsm.getDate({ format: rsm.dateFormat.dateTimeTZ }), rsm.logType.audit);
                };
                /**
                 * @description Gets passed script parameters key/value.
                 * @param {object} _paramObj;
                 * @param {array} _paramArr;
                 * @private
                 */
                function getParams(_paramObj, _paramArr) {
                    for (var i = 0; i < _paramArr.length; i++) {
                        _paramObj[_paramArr[i]] = runtime.getCurrentScript().getParameter({ name: _paramArr[i] });
                    }
                }
                return scriptHandler;
            }()),
            /**
             * @name address
             * @description Addresses handler
             * @param {object} _args Arguments
             * @param {object} [_args.record] Record
             * @param {string} [_args.recordType] Record Type
             * @param {number} [_args.recordId] Record Id
             * @type {address}
             * @namespace address
             * @memberof RSM_CR20
             * @constructor
             * @public
             */
            address: function(_args) {
                this.record = setRecord(_args);
                this.id = null;
                this.firstName = '';
                this.lastName = '';
                this.companyName = '';
                this.label = '';
                this.attention = '';
                this.addressee = '';
                this.addr1 = '';
                this.addr2 = '';
                this.addr3 = '';
                this.city = '';
                this.state = '';
                this.country = '';
                this.zip = '';
                this.phone = '';
                this.addrText = '';
                this.addressFormat = '';
                /**
                 * @description Compounds contactName based on the firstName and lastName properties
                 * @returns {string}
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.contactName = function() {
                    return (rsm.setDefault(this.firstName, '') + ' ' + rsm.setDefault(this.lastName, '')).trim();
                };
                /**
                 * @description Retrieves a transaction record address
                 * @param {string} _addressType Address Type
                 * @returns {rsm.address}
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.retrieveTranAddress = function(_addressType) {
                    if (!rsm.isEmpty(this.record) && !rsm.isEmpty(_addressType)) {
                        var objSubRecord = null;
                        if (this.record.isDynamic) objSubRecord = this.record.getSubrecord({ fieldId: _addressType });
                        else {
                            var addrInternalId = this.record.getValue({ fieldId: _addressType });
                            if (!rsm.isEmpty(addrInternalId)) objSubRecord = record.load({ type: 'address', id: addrInternalId, isDynamic: true });
                        }
                        if (objSubRecord) this.setAddressProps(objSubRecord);
                    }
                    return (this);
                };
                /**
                 * @description Sets a custom transaction record address
                 * @param {object} _args Arguments
                 * @param {string} _args.addressType Address Type
                 * @param {boolean} [_args.saveRecord=false] Save Record
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.setCustomTranAddress = function(_args) {
                    var saveRecord = rsm.parseBoolean(_args.saveRecord);
                    if (!rsm.isEmpty(this.record) && !rsm.isEmpty(_args.addressType)) {
                        if (this.record.isDynamic) {
                            var objSubRecord = this.record.getSubrecord({ fieldId: _args.addressType });
                            this.setAddressSubrecord(objSubRecord, _args.addressType);
                        } else {
                            var prefix = rsm.isEqual(_args.addressType, rsm.addressType.transaction.shippingAddress) ? 'ship' : 'bill';
                            this.record.setValue({ fieldId: prefix + 'addresslist', value: -2 });
                            this.record.setValue({ fieldId: prefix + 'override', value: true });
                            this.record.setValue({ fieldId: prefix + 'addressee', value: rsm.setDefault(this.addressee, this.contactName()) });
                            this.record.setValue({ fieldId: prefix + 'attention', value: this.attention });
                            this.record.setValue({ fieldId: prefix + 'country', value: rsm.setDefault(this.country, 'US') });
                            this.record.setValue({ fieldId: prefix + 'city', value: this.city });
                            this.record.setValue({ fieldId: prefix + 'state', value: this.state });
                            this.record.setValue({ fieldId: prefix + 'zip', value: this.zip });
                            this.record.setValue({ fieldId: prefix + 'addr1', value: this.addr1 });
                            this.record.setValue({ fieldId: prefix + 'addr2', value: this.addr2 });
                            this.record.setValue({ fieldId: prefix + 'addr3', value: this.addr3 });
                            this.record.setValue({ fieldId: prefix + 'phone', value: this.phone });
                        }
                        if (saveRecord) this.record.save();
                    }
                };
                /**
                 * @description Retrieves all entity addresses
                 * @returns {array}
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.retrieveAllEntityAddresses = function() {
                    var addrArr = [];
                    for (var i = 0; this.record && i < this.record.getLineCount('addressbook'); i++) {
                        var objSubRecord = null;
                        if (this.record.isDynamic) {
                            this.record.selectLine({ sublistId: 'addressbook', line: i });
                            objSubRecord = this.record.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                        } else objSubRecord = this.record.getSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress', line: i });
                        if (objSubRecord) {
                            var type = '';
                            if (this.record.getSublistValue({ sublistId: 'addressbook', fieldId: rsm.addressType.entity.defaultShipping, line: i })) type = 'Default Shipping';
                            else if (this.record.getSublistValue({ sublistId: 'addressbook', fieldId: rsm.addressType.entity.defaultBilling, line: i })) type = 'Default Billing';
                            else if (this.record.getSublistValue({ sublistId: 'addressbook', fieldId: rsm.addressType.entity.residential, line: i })) {
                                type = 'Residential Address';
                            }
                            addrArr.push({
                                id: objSubRecord.getValue({ fieldId: 'id' }),
                                type: type,
                                label: this.record.getSublistValue({ sublistId: 'addressbook', fieldId: 'label', line: i }) || '',
                                addrText: objSubRecord.getValue({ fieldId: 'addrtext' }) || '',
                                addressFormat: objSubRecord.getValue({ fieldId: 'addressformat' }) || ''
                            });
                        }
                    }
                    return addrArr;
                };
                /**
                 * @description Retrieves a entity record address
                 * @param {string} _addressType Address Type
                 * @returns {rsm.address}
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.retrieveEntityAddress = function(_addressType) {
                    for (var i = 0; this.record && i < this.record.getLineCount('addressbook'); i++) {
                        if (this.record.getSublistValue({ sublistId: 'addressbook', fieldId: _addressType, line: i })) {
                            var objSubRecord = null;
                            if (this.record.isDynamic) {
                                this.record.selectLine({ sublistId: 'addressbook', line: i });
                                objSubRecord = this.record.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                            } else objSubRecord = this.record.getSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress', line: i });
                            if (objSubRecord) {
                                this.firstName = this.record.getValue({ fieldId: 'firstname' }) || '';
                                this.lastName = this.record.getValue({ fieldId: 'lastname' }) || '';
                                this.companyName = this.record.getValue({ fieldId: 'companyname' }) || '';
                                this.setAddressProps(objSubRecord);
                            }
                            break;
                        }
                    }
                    return (this);
                };
                /**
                 * @description Adds address to a entity record
                 * @param {object} _args Arguments
                 * @param {string} _args.addressType Address Type
                 * @param {boolean} [_args.markDefault=false] Mark as default
                 * @param {boolean} [_args.saveRecord=false] Save record
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.addEntityAddress = function(_args) {
                    if (!rsm.isEmpty(this.record) && !rsm.isEmpty(_args.addressType)) {
                        var markDefault = rsm.parseBoolean(_args.markDefault);
                        var saveRecord = rsm.parseBoolean(_args.saveRecord);
                        var objSubRecord = null;
                        if (this.record.isDynamic) {
                            this.record.selectNewLine({ sublistId: 'addressbook' });
                            this.record.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'label', value: rsm.isEmpty(this.label) ? this.contactName() : this.label });
                            this.record.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: _args.addressType, value: markDefault });
                            objSubRecord = this.record.getCurrentSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress' });
                        } else {
                            var index = this.record.getLineCount({ sublistId: 'addressbook' });
                            this.record.insertLine({ sublistId: 'addressbook', line: index });
                            this.record.setSublistValue({
                                sublistId: 'addressbook', fieldId: 'label', line: index, value: rsm.isEmpty(this.label) ? this.contactName() : this.label
                            });
                            this.record.setSublistValue({
                                sublistId: 'addressbook', fieldId: _args.addressType, line: index, value: markDefault
                            });
                            objSubRecord = this.record.getSublistSubrecord({ sublistId: 'addressbook', fieldId: 'addressbookaddress', line: index });
                        }
                        if (objSubRecord) {
                            this.setAddressSubrecord(objSubRecord, _args.addressType);
                            if (saveRecord) this.record.save();
                        }
                    }
                };
                /**
                 * @description Clears all properties of Address class
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.resetAddressProps = function() {
                    var propArr = ['id', 'firstName', 'lastName', 'companyName', 'label', 'attention', 'addressee',
                        'addr1', 'addr2', 'addr3', 'city', 'country', 'zip', 'phone', 'addrText', 'addressFormat'];
                    for (var prop in this) {
                        if (rsm.hasOwnProp(this, prop) && (propArr.indexOf(prop) > -1)) this[prop] = '';
                    }
                };
                /**
                 * @description Returns the address info as a key/value object
                 * @returns {{zip: *, country: *, addressee: *, addr2: *, addr1: *, city: *, phone: *, addr3: *, addressFormat: *, attention: *, id: *, addrText: *}}
                 * @memberof RSM_CR20.address
                 * @public
                 */
                this.toObject = function() {
                    if (!rsm.isEmpty(this.id) || !rsm.isEmpty(this.addr1) || !rsm.isEmpty(this.country)) {
                        return {
                            id: this.id,
                            attention: this.attention,
                            addressee: this.addressee,
                            addr1: this.addr1,
                            addr2: this.addr2,
                            addr3: this.addr3,
                            city: this.city,
                            state: this.state,
                            country: this.country,
                            zip: this.zip,
                            phone: this.phone,
                            addressFormat: this.addressFormat,
                            addrText: this.addrText
                        };
                    }
                    return {};
                };
                /**
                 * @param {object} _objSubRecord Address Sub-record
                 * @param {string} _addressType Address type
                 * @private
                 */
                this.setAddressSubrecord = function(_objSubRecord, _addressType) {
                    _objSubRecord.setValue({ fieldId: 'attention', value: this.attention });
                    _objSubRecord.setValue({ fieldId: 'addressee', value: rsm.setDefault(this.addressee, this.contactName()) });
                    _objSubRecord.setValue({ fieldId: 'country', value: rsm.setDefault(this.country, 'US') });
                    _objSubRecord.setValue({ fieldId: 'city', value: this.city });
                    _objSubRecord.setValue({ fieldId: 'state', value: this.state });
                    _objSubRecord.setValue({ fieldId: 'zip', value: this.zip });
                    _objSubRecord.setValue({ fieldId: 'addr1', value: this.addr1 });
                    _objSubRecord.setValue({ fieldId: 'addr2', value: this.addr2 });
                    _objSubRecord.setValue({ fieldId: 'addr3', value: this.addr3 });
                    _objSubRecord.setValue({ fieldId: 'addrphone', value: this.phone });
                    if (this.record.isDynamic && [rsm.addressType.transaction.billingAddress, rsm.addressType.transaction.shippingAddress].indexOf(_addressType) === -1) {
                        this.record.commitLine({ sublistId: 'addressbook' });
                    }
                };
                /**
                 * @param {object} _objSubRecord Address Sub-record
                 * @private
                 */
                this.setAddressProps = function(_objSubRecord) {
                    this.id = _objSubRecord.getValue({ fieldId: 'id' }) || null;
                    this.addressee = _objSubRecord.getValue({ fieldId: 'addressee' }) || '';
                    this.attention = _objSubRecord.getValue({ fieldId: 'attention' }) || '';
                    this.addr1 = _objSubRecord.getValue({ fieldId: 'addr1' }) || '';
                    this.addr2 = _objSubRecord.getValue({ fieldId: 'addr2' }) || '';
                    this.addr3 = _objSubRecord.getValue({ fieldId: 'addr3' }) || '';
                    this.city = _objSubRecord.getValue({ fieldId: 'city' }) || '';
                    this.state = _objSubRecord.getValue({ fieldId: 'state' }) || '';
                    this.country = _objSubRecord.getValue({ fieldId: 'country' }) || '';
                    this.zip = _objSubRecord.getValue({ fieldId: 'zip' }) || '';
                    this.phone = _objSubRecord.getValue({ fieldId: 'addrphone' }) || '';
                    this.addrText = _objSubRecord.getValue({ fieldId: 'addrtext' }) || '';
                    this.addressFormat = _objSubRecord.getValue({ fieldId: 'addressformat' }) || '';
                };
                /**
                 * @param {object} _args Arguments
                 * @param {object} [_args.record] Record
                 * @param {string} [_args.recordType] Record Type
                 * @param {number} [_args.recordId] Record Id
                 * @returns {object}
                 * @private
                 */
                function setRecord(_args) {
                    var objRecord = null;
                    if (!rsm.isEmpty(_args.record)) objRecord = _args.record;
                    else if (!rsm.isEmpty(_args.recordType) && !rsm.isEmpty(_args.recordId)) {
                        objRecord = record.load({ type: _args.recordType, id: _args.recordId, isDynamic: true });
                    }
                    return objRecord;
                }
                return (this);
            }
        };
    }());

    /**
     * @description lpad() pads the current string with another string (repeated, if needed)
     * so that the resulting string reaches the given length. The padding is applied from the left of the current string.
     * @example
     * 'A'.lpad(3, 'B'); // returns 'BBA'
     * 'A'.lpad(4, 'B'); // returns 'BBBA'
     * @param {number} _targetLength - The length of the resulting string once the current string has been padded.
     * @param {string} _padString - The string to pad the current string with.
     * @returns {string} Padding string
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(String, 'lpad')) {
        String.prototype.lpad = function(_targetLength, _padString) {
            var str = String(this);
            if (rsm.isEmpty(str)) return '';
            while (str.length < (_targetLength || 2)) {
                str = _padString + str;
            }
            return str;
        };
    }
    /**
     * @description Capitalize the first letter of each word in a string
     * @returns {string}
     * @example
     * 'Main account type'.capitalizeWords(); // Main Account Type
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(String, 'capitalizeWords')) {
        String.prototype.capitalizeWords = function() {
            return this.replace(/\w\S*/g, function(s) { return s.charAt(0).toUpperCase() + s.substr(1).toLowerCase(); });
        };
    }
    /**
     * @description Capitalize the first letter of each word and removes spaces in a string
     * @returns {string}
     * @example
     * 'Main account type'.toCamelCase(); // MainAccountType
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(String, 'toCamelCase')) {
        String.prototype.toCamelCase = function() {
            return this.capitalizeWords().replace(/[^\w\d]/gi, '');
        };
    }
    /**
     * @description lpad() pads the current string with another string (repeated, if needed)
     * so that the resulting string reaches the given length. The padding is applied from the left of the current string.
     * @example
     * 7.lpad(3, '0'); // returns '007'
     * 7.lpad(4, '0'); // returns '0007'
     * @param {number} _targetLength - The length of the resulting string once the current string has been padded.
     * @param {string} _padString - The string to pad the current string with.
     * @returns {string} Padding string
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(Number, 'lpad')) {
        Number.prototype.lpad = function(_targetLength, _padString) {
            var str = String(this);
            if (rsm.isEmpty(str)) return '';
            while (str.length < (_targetLength || 2)) {
                str = _padString + str;
            }
            return str;
        };
    }
    /**
     * @description roundUp() rounds up to the given decimals
     * @param {number} _decimals Decimals
     * @returns {number}
     * @example
     * var price = 25.99;
     * var quantity = 30;
     * var numberToRound = 100 - (price / quantity) * 100; // 13.3666666666
     * numberToRound.roundUp(2); // 13.37
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(Number, 'roundUp')) {
        Number.prototype.roundUp = function(_decimals) {
            return Number((Math.ceil(this + 'e' + _decimals) + 'e-' + _decimals));
        };
    }
    /**
     * @description between() validates if a number is between two values,
     * if it is Documentation the range sets the min or max accordingly.
     * @example
     * var maxRange = 200;
     * maxRange.between(1, 1000); // returns 200
     *
     * var maxRange = 1200;
     * maxRange.between(1, 1000); // returns 1000
     *
     * var maxRange = 20;
     * maxRange.between(50, 100); // returns 50
     * @param {number} _min Minimum
     * @param {number} _max Maximum
     * @returns {number}
     * @memberof RSM_CR20
     */
    if (!rsm.hasOwnProp(Number, 'between')) {
        Number.prototype.between = function(_min, _max) {
            var min = Math.min(_min, _max);
            var max = Math.max(_min, _max);
            if (this < min) {
                return min;
            } else if (this > max) {
                return max;
            } else {
                return this;
            }
        };
    }

    return rsm;
});
