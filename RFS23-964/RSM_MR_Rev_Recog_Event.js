/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */


/**
 * Module Description
 *
 * This script creates Revenue Recognition Event records with incremental
 * percentage shipping increase in fulfillment of Sales Order lines.
 *
 */

define(['N/search', 'N/record', 'N/runtime', 'N/error', 'N/format'],

	/**
	 * @param {search}
	 *            search
	 */
	function (search, record, runtime, error, format) {
		var NSUtil = {};

		/**
		  * Evaluate if the given string or object value is empty, null or undefined.
		  * @param {String} stValue - string or object to evaluate
		  * @returns {Boolean} - true if empty/null/undefined, false if not
		  * @author mmeremilla
		  * @memberOf NSUtil
		  */
		NSUtil.isEmpty = function (stValue) {
			return ((stValue === '' || stValue == null || stValue == undefined)
				|| (stValue.constructor === Array && stValue.length == 0)
				|| (stValue.constructor === Object && (function (v) { for (var k in v) return false; return true; })(stValue)));
		};

		/**
		 * Get all of the results from the search even if the results are more than 1000.
		 * @param {String} stRecordType - the record type where the search will be executed.
		 * @param {String} stSearchId - the search id of the saved search that will be used.
		 * @param {nlobjSearchFilter[]} arrSearchFilter - array of nlobjSearchFilter objects. The search filters to be used or will be added to the saved search if search id was passed.
		 * @param {nlobjSearchColumn[]} arrSearchColumn - array of nlobjSearchColumn objects. The columns to be returned or will be added to the saved search if search id was passed.
		 * @returns {nlobjSearchResult[]} - an array of nlobjSearchResult objects
		 * @author memeremilla - initial version
		 * @author gmanarang - used concat when combining the search result
		 */
		NSUtil.search = function (stRecordType, stSearchId, arrSearchFilter, arrSearchColumn, arrFilterExpression) {
			var arrReturnSearchResults = [];
			var objSavedSearch = {};

			var maxResults = 1000;

			if (!this.isEmpty(stSearchId)) {
				objSavedSearch = search.load(
					{
						id: stSearchId
					});
			}
			else if (!this.isEmpty(stRecordType)) {
				objSavedSearch = search.create(
					{
						type: stRecordType
					});
			}

			// add search filter if one is passed
			if (!this.isEmpty(arrSearchFilter)) {
				if (Array.isArray(arrSearchFilter)) {
					objSavedSearch.filters = objSavedSearch.filters.concat(arrSearchFilter);
				}
				else {
					objSavedSearch.filters = arrSearchFilter;
				}

			}

			// add search column if one is passed
			if (!this.isEmpty(arrSearchColumn)) {
				objSavedSearch.columns = arrSearchColumn;
			}

			var objResultset = objSavedSearch.run();
			var intSearchIndex = 0;
			var objResultSlice = null;
			do {
				objResultSlice = objResultset.getRange(intSearchIndex, intSearchIndex + maxResults);
				if (!(objResultSlice)) {
					break;
				}

				for (var intRs in objResultSlice) {
					arrReturnSearchResults.push(objResultSlice[intRs]);
					intSearchIndex++;
				}
			}
			while (objResultSlice.length >= maxResults);

			return arrReturnSearchResults;
		};

		/**
		 * Get all of the results from the search even if the results are more than 1000.
		 * @param {Object} option - search options similar to var option = {id : '', recordType : '', filters : [], columns : []}
		 * @author memeremilla
		 * @memberOf NSUtil
		 */
		NSUtil.searchAll = function (option) {
			var arrReturnSearchResults = new Array();
			var objSavedSearch = {};

			var maxResults = 1000;

			if (!this.isEmpty(option.id)) {
				objSavedSearch = search.load(
					{
						id: option.id
					});
			}
			else if (!this.isEmpty(option.recordType)) {
				objSavedSearch = search.create(
					{
						type: option.recordType
					});
			}

			// add search filter if one is passed
			if (!this.isEmpty(option.filters)) {
				objSavedSearch.filters = option.filters;
			}

			if (!this.isEmpty(option.filterExpression)) {
				objSavedSearch.filterExpression = option.filterExpression;
			}

			// add search column if one is passed
			if (!this.isEmpty(option.columns)) {
				objSavedSearch.columns = option.columns;
			}

			var objResultset = objSavedSearch.run();
			var intSearchIndex = 0;
			var objResultSlice = null;
			do {
				objResultSlice = objResultset.getRange(intSearchIndex, intSearchIndex + maxResults);
				if (!(objResultSlice)) {
					break;
				}

				for (var intRs in objResultSlice) {
					arrReturnSearchResults.push(objResultSlice[intRs]);
					intSearchIndex++;
				}
			}
			while (objResultSlice.length >= maxResults);

			return arrReturnSearchResults;
		};

		NSUtil.forceInt = function (stValue) {
			var intValue = parseInt(stValue, 10);

			if (isNaN(intValue) || (stValue == Infinity)) {
				return 0;
			}

			return intValue;
		};

		/**
		 * Converts string to float. If value is infinity or can't be converted to a number, 0.00 will be returned.
		 * @param {String} stValue - any string
		 * @returns {Number} - a floating point number
		 * @author jsalcedo
		 */
		NSUtil.forceFloat = function (stValue) {
			var flValue = parseFloat(stValue);

			if (isNaN(flValue) || (stValue == Infinity)) {
				return 0.00;
			}

			return flValue;
		};

		/**
		*
		* This function evaluates whether the contents of a variable is empty.
		*
		*/
		function isEmpty(stValue) {
			if ((stValue == '') || (stValue == null) || (stValue == undefined)) {
				return true;
			}
			return false;
		}

		var scriptRef = runtime.getCurrentScript();


		/**
		 * Marks the beginning of the Map/Reduce process and generates input
		 * data.
		 *
		 * @typedef {Object} ObjectRef
		 * @property {number} id - Internal ID of the record instance
		 * @property {string} type - Record type id
		 *
		 * @return {Array|Object|Search|RecordRef} inputSummary
		 * @since 2015.1
		 */

		function getInputData() {
			var stLoggerTitle = 'getInputData';
			log.audit(stLoggerTitle, '>> Script Started <<');

			var revRecogEventSOSvdSrch = scriptRef.getParameter('custscript_rev_recog_event_so');

			var getSalesOrdersObj = getSalesOrders(revRecogEventSOSvdSrch);
			log.audit(stLoggerTitle, 'Number of Sales Orders : ' + getSalesOrdersObj.length);

			return getSalesOrdersObj;
		}


		/**
		 * Executes when the map entry point is triggered and applies to
		 * each key/value pair.
		 *
		 * @param {MapSummary}
		 *            context - Data collection containing the key/value
		 *            pairs to process through the map stage
		 * @since 2015.1
		 */
		function map(context) {

			var salesOrders = JSON.parse(context.value);

			var SORecId = salesOrders.values['GROUP(internalid)'][0].value;

			var soStatusObj = search.lookupFields({
				type: record.Type.SALES_ORDER,
				id: SORecId,
				columns: ['status']
			});

			var soStatusLookupDescr = soStatusObj.status[0].text;
			var soStatusLookup = soStatusObj.status[0].value;

			context.write({
				key: SORecId,
				value: {
					soStatus: soStatusLookup,
					csStatusDescr: soStatusLookupDescr
				}
			});
		}

		/**
		 * Executes when the reduce entry point is triggered and applies to
		 * each group.
		 *
		 * @param {ReduceSummary}
		 *            context - Data collection containing the groups to
		 *            process through the reduce stage
		 * @since 2015.1
		 */

		function reduce(context) {
			try {
				var stLoggerTitle = 'Reduce';

				var arrSOValues = context.values;

				var soRecId = context.key;

				log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + '>> Script Started <<');

				var soStatusBilled = scriptRef.getParameter('custscript_so_status_billed');
				var soProdLinesSvdSrch = scriptRef.getParameter('custscript_so_prod_lines_svd_srch');
				var revRecEventSvdSrch = scriptRef.getParameter('custscript_rev_recog_event_svd_srch');

				var sProdLinesAllocGrpsSvdSrch = scriptRef.getParameter('custscript_so_prod_lines_alloc_grp');

				var soSpclShipItemsSvdSrch = scriptRef.getParameter('custscript_so_spcl_ship_items');

				var soSumQtyFulfilledLbl = scriptRef.getParameter('custscript_so_qty_fulfill_lbl');
				var soSumTotlAmtLbl = scriptRef.getParameter('custscript_so_totl_amt_lbl');
				var soIFDateLbl = scriptRef.getParameter('custscript_so_if_dte_lbl');
				var revRecogEventTyp = scriptRef.getParameter('custscript_event_type');

				for (var i in arrSOValues) {
					var objSOVal = arrSOValues[i];
					var objSOVal = JSON.parse(objSOVal);
				}

				log.audit(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'objSOVal : ' + JSON.stringify(objSOVal));

				var soRecord = record.load({
					type: record.Type.SALES_ORDER,
					id: soRecId
				});

				var fulfillComplete = 'T';

				var arrAllocGrps = getAllocGrps(sProdLinesAllocGrpsSvdSrch, soRecId);

				log.debug(stLoggerTitle, 'arrAllocGrps: ' + arrAllocGrps.length + ' arrAllocGrps JSON: ' + JSON.stringify(arrAllocGrps));

				for (var a = 0; a < arrAllocGrps.length; a++) {
					var soProdLine = arrAllocGrps[a].getValue({
						name: 'revenueallocationgroup',
						summary: search.Summary.GROUP,
						join: 'item'
					});

					var soProdLineDesc = arrAllocGrps[a].getText({
						name: 'revenueallocationgroup',
						summary: search.Summary.GROUP,
						join: 'item'
					});

					/*					var maxIFDate = arrAllocGrps[a].getValue({
											name : 'trandate',
											summary: search.Summary.MAX,
											join: 'fulfillingTransaction'
										});*/

					log.debug(stLoggerTitle, 'soProdLineDesc: ' + soProdLineDesc + ' maxIFDate: ' + maxIFDate);

					var prodLinesObj = getShippingItemLines(soProdLinesSvdSrch, soRecId, soProdLine);

					log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'prodLinesObj.length: ' + prodLinesObj.length + ' prodLinesObj JSON: ' + JSON.stringify(prodLinesObj));

					var columns = getSvdSrchColumns(soProdLinesSvdSrch);

					var soSumQtyFulfilled = 0;
					var soSumTotlAmt = 0;

					var soSumTotlAmt = getItemLinesTotal(prodLinesObj, columns, soSumTotlAmtLbl);

					var soSumQtyFulfilled = getItemLinesTotal(prodLinesObj, columns, soSumQtyFulfilledLbl);

					var maxIFDate = getMaxIFDate(prodLinesObj, columns, soIFDateLbl);

					log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'soProdLine: ' + soProdLine + ' soProdLineDesc: ' + soProdLineDesc + ' soSumQtyFulfilled: ' + soSumQtyFulfilled + ' soSumTotlAmt: ' + soSumTotlAmt + ' maxIFDate: ' + maxIFDate);

					if (soSumQtyFulfilled > 0) {
						var updCumulativePct = (forceParseFloat(soSumQtyFulfilled) / forceParseFloat(soSumTotlAmt)).toFixed(2);

						var shipLineType = 'Allocation';

						var soLineUniqueKeyObj = getSOLineKey(soProdLine, soRecId, shipLineType);
						log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'soLineUniqueKeyObj: ' + JSON.stringify(soLineUniqueKeyObj));

						if (!NSUtil.isEmpty(soLineUniqueKeyObj)) {
							var soLineUniqueKey = soLineUniqueKeyObj[0].getValue({
								name: 'lineuniquekey'
							});

							revRecogEventPct = getRevRecogEventPct(revRecEventSvdSrch, soRecId, soLineUniqueKey);
							log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'updCumulativePct: ' + updCumulativePct + ' revRecogEventPct: ' + forceParseFloat(revRecogEventPct) / 100);

							if (forceParseFloat(updCumulativePct) != forceParseFloat(revRecogEventPct) / 100) {
								fulfillComplete = 'F';
								log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Create new Revenue Recognition Event Record');

								var recRecogEventId = crRevRecogEvent(soLineUniqueKey, revRecogEventTyp, maxIFDate, updCumulativePct);
								log.debug(stLoggerTitle, 'Completed function crRevRecogEvent : ' + recRecogEventId);

								if (recRecogEventId > 0) {
									updSOItemLine(soRecord, soLineUniqueKey, recRecogEventId);
								}
							}
							else if (forceParseFloat(updCumulativePct) == forceParseFloat(revRecogEventPct) / 100) {
								if (forceParseFloat(updCumulativePct) != 1.00) {
									fulfillComplete = 'F';
								}
								log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'No change in cumulative percentage');
							}
						}
					}
					else if (forceParseFloat(soSumQtyFulfilled) == 0) {
						fulfillComplete = 'F';
						log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Nothing fulfilled for this item line');
					}
				}

				log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Completed evaluating cumulative percentage for Product Lines.  Evaluating Special Shipping Lines.');
				//**************************************************************************************//
				var spclItemLinesObj = getShippingItemLines(soSpclShipItemsSvdSrch, soRecId, null);

				log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'spclItemLinesObj: ' + JSON.stringify(spclItemLinesObj));
				log.debug(stLoggerTitle, 'spclItemLinesObj[0]: ' + JSON.stringify(spclItemLinesObj[0]))
				var columns = getSvdSrchColumns(soSpclShipItemsSvdSrch);

				var soSumTotlAmt = 0;
				var soSumQtyFulfilled = 0;

				if (!NSUtil.isEmpty(spclItemLinesObj)) {
					var soSumTotlAmt = getItemLinesTotal(spclItemLinesObj, columns, soSumTotlAmtLbl);

					var soSumQtyFulfilled = getItemLinesTotal(spclItemLinesObj, columns, soSumQtyFulfilledLbl);

					var maxIFDate = getMaxIFDate(spclItemLinesObj, columns, soIFDateLbl);

					/*					var maxIFDate = spclItemLinesObj[0].getValue({
											name : 'trandate',
											summary: search.Summary.MAX,
											join: 'fulfillingTransaction'
										});*/

					log.debug(stLoggerTitle, 'soSumQtyFulfilled: ' + soSumQtyFulfilled + ' soSumTotlAmt: ' + soSumTotlAmt + ' maxIFDate: ' + maxIFDate);

					if (soSumQtyFulfilled > 0) {
						var updCumulativePct = (forceParseFloat(soSumQtyFulfilled) / forceParseFloat(soSumTotlAmt)).toFixed(2);
						log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'updCumulativePct: ' + updCumulativePct);

						var shipLineType = 'Special';

						var soLineUniqueKeyObj = getSOLineKey(soProdLine, soRecId, shipLineType);
						log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'soLineUniqueKeyObj: ' + JSON.stringify(soLineUniqueKeyObj));

						if (!NSUtil.isEmpty(soLineUniqueKeyObj)) {
							for (var y = 0; y < soLineUniqueKeyObj.length; y++) {
								var soLineUniqueKey = soLineUniqueKeyObj[y].getValue({
									name: 'lineuniquekey'
								});

								revRecogEventPct = getRevRecogEventPct(revRecEventSvdSrch, soRecId, soLineUniqueKey);
								log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'updCumulativePct: ' + updCumulativePct + ' revRecogEventPct: ' + forceParseFloat(revRecogEventPct) / 100);

								if (forceParseFloat(updCumulativePct) != forceParseFloat(revRecogEventPct) / 100) {
									fulfillComplete = 'F';
									log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Create new Revenue Recognition Event Record');

									var recRecogEventId = crRevRecogEvent(soLineUniqueKey, revRecogEventTyp, maxIFDate, updCumulativePct);
									log.debug(stLoggerTitle, 'recRecogEventId : ' + recRecogEventId);

									if (recRecogEventId > 0) {
										updSOItemLine(soRecord, soLineUniqueKey, recRecogEventId);
									}
								}
								else if (forceParseFloat(updCumulativePct) == forceParseFloat(revRecogEventPct) / 100) {
									if (forceParseFloat(updCumulativePct) != 1.00) {
										fulfillComplete = 'F';
									}
									log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'No change in cumulative percentage');
								}
							}
						}
					}
					else if (forceParseFloat(soSumQtyFulfilled) == 0) {
						fulfillComplete = 'F';
						log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Nothing fulfilled for this item line');
					}
				}

				log.debug(stLoggerTitle, 'KEY: ' + soRecId + ' ' + 'Completed evaluating cumulative percentage for Special Shipping Lines.');

				if (fulfillComplete == 'T' && objSOVal.csStatusDescr == soStatusBilled) {
					soRecord.setValue({
						fieldId: 'custbody_rev_recog_events_created',
						value: true,
						ignoreFieldChange: true
					});
				}

				soRecord.save();
			}
			catch (error) {
				if (error.message != undefined) {
					log.error('Process Error', stLoggerTitle + ' : ' + error.name + ' : ' + error.message);

					var message = error.name + ' : ' + error.message;
				}
				else {
					log.error('Unexpected Error', error.toString());

				}
			}
		}


		/**
		*
		* This function calculates the Total for Special Shipping Item lines
		*
		*/
		function getItemLinesTotal(itemLinesObj, columns, soSumTotlAmtLbl) {
			var stLoggerTitle = 'getItemLinesTotal';

			var soSumTotlAmt = 0;

			for (var i = 0; i < itemLinesObj.length; i++) {
				for (var j = 0; j < columns.length; j++) {
					if (columns[j].label == soSumTotlAmtLbl) {
						var soSumTotlAmt = NSUtil.forceFloat(soSumTotlAmt) + NSUtil.forceFloat(itemLinesObj[i].getValue(columns[j]));
					}
				}
			}

			return soSumTotlAmt;
		}

		/**
		*
		* This function determines Max IF Date
		*
		*/
		function getMaxIFDate(itemLinesObj, columns, soIFDateLbl) {
			var stLoggerTitle = 'getMaxIFDate';

			var soMaxIFDate = '';

			for (var i = 0; i < itemLinesObj.length; i++) {
				for (var j = 0; j < columns.length; j++) {
					if (columns[j].label == soIFDateLbl) {
						var soCurrIFDate = itemLinesObj[i].getValue(columns[j]);

						if (soCurrIFDate) {
							soCurrIFDate = formatDate(soCurrIFDate);

							if (isEmpty(soMaxIFDate)) {
								soMaxIFDate = soCurrIFDate;
							}
						}

						if (soCurrIFDate > soMaxIFDate) {
							soMaxIFDate = soCurrIFDate;
						}
					}
				}
			}

			return soMaxIFDate;
		}

		/**
		*
		* This function reformats date values.
		*
		*/
		function formatDate(date) {
			var stLoggerTitle = 'formatDate';

			try {
				// Multiply by 1000 because JS works in milliseconds instead of the UNIX seconds
				var date = new Date(date);

				var year = date.getFullYear();
				var month = date.getMonth() + 1; // getMonth() is zero-indexed, so we'll increment to get the correct month number
				var day = date.getDate();

				month = (month < 10) ? '0' + month : month;
				day = (day < 10) ? '0' + day : day;

				month = month.toString();
				day = day.toString();
				year = year.toString();

				var val = month + '/' + day + '/' + year;

				return val;
			}
			catch (error) {
				if (error.message != undefined) {
					log.error('Process Error', stLoggerTitle + ' : ' + error.name + ' : ' + error.message);
				}
				else {
					log.error('Unexpected Error', error.toString());
				}
			}
		}

		/**
		*
		* This function invokes the Saved Search which retrieves Sales Orders
		* which are not completely fulfilled.
		*
		*/
		function getSalesOrders(revRecogEventSOSvdSrch) {
			var stLoggerTitle = 'getSubscriptions';

			var mySearch = search.load({
				id: revRecogEventSOSvdSrch
			});

			var ssSalesOrders = NSUtil.search(null, revRecogEventSOSvdSrch, null, null, null);

			return ssSalesOrders;
		}

		/**
		*
		* This function invokes the Saved Search which retrieves column names
		*
		*/
		function getSvdSrchColumns(soShipLineSvdSrch) {
			var stLoggerTitle = 'getSvdSrchColumns';

			mySearch = search.load(
				{
					id: soShipLineSvdSrch
				});

			var columns = mySearch.columns;

			return columns;
		}


		/**
		*
		* This function returns Shipping Line Items
		*
		*/
		function getShippingItemLines(soShippingLinesSvdSrch, soRecId, soAllocGrp) {
			var stLoggerTitle = 'getShippingItemLines';

			//			log.debug(stLoggerTitle, '>>>>> Function Started <<<<<');
			var arrSOFltr = [];

			arrSOFltr.push(
				search.createFilter({
					name: 'internalid',
					operator: search.Operator.ANYOF,
					values: soRecId
				})
			);

			if (!NSUtil.isEmpty(soAllocGrp)) {
				arrSOFltr.push(
					search.createFilter({
						name: 'revenueallocationgroup',
						operator: search.Operator.ANYOF,
						values: soAllocGrp,
						join: 'item'
					})
				);
			}

			var ssSOShipItemLines = NSUtil.search(null, soShippingLinesSvdSrch, arrSOFltr, null, null);

			log.debug(stLoggerTitle, 'ssSOShipItemLines.length: ' + ssSOShipItemLines.length);

			return ssSOShipItemLines;
		}

		/**
		*
		* This function returns unique list of Allocation Groups
		* in the Sales Order
		*
		*/
		function getAllocGrps(sProdLinesAllocGrpsSvdSrch, soRecId) {
			var stLoggerTitle = 'getAllocGrps';

			log.debug(stLoggerTitle, '>>>>> Function Started <<<<<');
			var arrSOFltr = [];

			arrSOFltr.push(
				search.createFilter({
					name: 'internalid',
					operator: search.Operator.ANYOF,
					values: soRecId
				})
			);

			var ssSOAllocGrps = NSUtil.search(null, sProdLinesAllocGrpsSvdSrch, arrSOFltr, null, null);

			log.debug(stLoggerTitle, 'ssSOAllocGrps.length: ' + ssSOAllocGrps.length);

			return ssSOAllocGrps;
		}

		/**
		*
		* This function retrieves the line unique key
		*
		*/
		function getSOLineKey(soProdLine, soRecId, shipLineType) {
			try {
				var stLoggerTitle = 'getSOLineKey';
				log.audit(stLoggerTitle, '>>>>> Function Started <<<<<');

				if (shipLineType == 'Allocation') {
					var transactionSearchObj = search.create({
						type: "transaction",
						filters:
							[
								["type", "anyof", "SalesOrd"],
								"AND",
								["internalid", "anyof", soRecId],
								"AND",
								["item.custitem_shipitemallocationgroup", "anyof", soProdLine],
								"AND",
								["mainline", "is", "F"],
								"AND",
								["shipping", "is", "F"],
								"AND",
								["taxline", "is", "F"],
								"AND",
								["item.type", "anyof", "NonInvtPart"]
							],
						columns:
							[
								search.createColumn({ name: "lineuniquekey", label: "Line Unique Key" })
							]
					});
				}
				else if (shipLineType == 'Special') {
					var transactionSearchObj = search.create({
						type: "transaction",
						filters:
							[
								["type", "anyof", "SalesOrd"],
								"AND",
								["mainline", "is", "F"],
								"AND",
								["taxline", "is", "F"],
								"AND",
								["shipping", "is", "F"],
								"AND",
								["item.type", "anyof", "NonInvtPart"],
								"AND",
								["internalid", "anyof", soRecId],
								"AND",
								["item.revenueallocationgroup", "anyof", "@NONE@"],
								"AND",
								["item.custitem_specialshippingitem", "noneof", "@NONE@"]
							],
						columns:
							[
								search.createColumn({ name: "lineuniquekey", label: "Line Unique Key" })
							]
					});
				}
				var searchResult = transactionSearchObj.run().getRange({
					start: 0,
					end: 1000
				});

				log.debug(stLoggerTitle, 'result: ' + JSON.stringify(searchResult));

				return searchResult;
			}
			catch (error) {
				if (error.message != undefined) {
					log.error('Process Error', stLoggerTitle + ' : ' + error.name + ' : ' + error.message);

					var message = error.name + ' : ' + error.message;
				}
				else {
					log.error('Unexpected Error', error.toString());
				}
			}
		}

		/**
		*
		* This function returns the current percent on the RR Event record
		*
		*/
		function getRevRecogEventPct(revRecEventSvdSrch, soRecId, soLineUniqueKey) {
			var stLoggerTitle = 'getRevRecogEventPct';

			var mySearch = search.load({
				id: revRecEventSvdSrch
			});

			var arrRevRecogEventFltr = [];

			arrRevRecogEventFltr.push(
				search.createFilter({
					name: 'lineuniquekey',
					operator: search.Operator.EQUALTO,
					values: soLineUniqueKey,
					join: 'transaction'
				})
			);

			var ssRevRecog = NSUtil.search(null, revRecEventSvdSrch, arrRevRecogEventFltr, null, null);

			log.debug(stLoggerTitle, 'ssRevRecog: ' + JSON.stringify(ssRevRecog));

			var cumulativePct = 0;

			if (!NSUtil.isEmpty(ssRevRecog)) {
				var cumulativePct = ssRevRecog[0].getValue({
					name: 'cumulativepercentcomplete',
					summary: search.Summary.MAX
				});

				cumulativePct = forceParseFloat(cumulativePct);
			}

			return cumulativePct;
		}

		/**
		*
		* This function createst the RR Event record
		*
		*/
		function crRevRecogEvent(soLineUniqueKey, revRecogEventTyp, maxIFDate, updCumulativePct) {
			try {
				var stLoggerTitle = 'crRevRecogEvent';
				log.audit(stLoggerTitle, '>>>>> Function Started <<<<<');

				var revRecord = record.create({
					type: 'billingrevenueevent',
				});

				revRecord.setValue({
					fieldId: 'transactionline',
					value: soLineUniqueKey,
					ignoreFieldChange: false
				});

				revRecord.setValue({
					fieldId: 'eventtype',
					value: revRecogEventTyp,
					ignoreFieldChange: false
				});

				log.debug(stLoggerTitle, 'maxIFDate: ' + maxIFDate + ' updCumulativePct: ' + updCumulativePct);
				maxIFDate = format.parse({ value: maxIFDate, type: format.Type.DATE });

				revRecord.setValue({
					fieldId: 'eventdate',
					value: maxIFDate,
					ignoreFieldChange: false
				});

				revRecord.setValue({
					fieldId: 'cumulativepercentcomplete',
					value: parseFloat(updCumulativePct) * 100,
					ignoreFieldChange: false
				});

				var revRecId = revRecord.save();

				return revRecId;
			}
			catch (error) {
				if (error.message != undefined) {
					log.error('Process Error', stLoggerTitle + ' : ' + error.name + ' : ' + error.message);

					var message = error.name + ' : ' + error.message;
				}
				else {
					log.error('Unexpected Error', error.toString());
				}
			}
		}

		/**
		*
		* This function updates the SO line with the RR Event record
		*
		*/
		function updSOItemLine(soRecord, soLineUniqueKey, recRecogEventId) {
			try {
				var stLoggerTitle = 'updSOItemLine';
				log.audit(stLoggerTitle, '>>>>> Function Started <<<<<');

				var recLinePos = soRecord.findSublistLineWithValue({ sublistId: 'item', fieldId: 'lineuniquekey', value: soLineUniqueKey });
				log.debug(stLoggerTitle, 'soLineUniqueKey: ' + soLineUniqueKey + ' recRecogEventId: ' + recRecogEventId + ' recLinePos: ' + recLinePos);

				if (recLinePos >= 0) {
					soRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_rev_event_rec', line: recLinePos, value: recRecogEventId });
				}
			}
			catch (error) {
				if (error.message != undefined) {
					log.error('Process Error', stLoggerTitle + ' : ' + error.name + ' : ' + error.message);

					var message = error.name + ' : ' + error.message;
				}
				else {
					log.error('Unexpected Error', error.toString());
				}
			}
		}

		/**
		 * Executes when the summarize entry point is triggered and applies
		 * to the result set.
		 *
		 * @param {Summary}
		 *            summary - Holds statistics regarding the execution of
		 *            a map/reduce script
		 * @since 2015.1
		 */

		function summarize(summary) {
			handleErrors(summary);
			handleSummaryOutput(summary.output);

			// *********** HELPER FUNCTIONS ***********

			function handleErrors(summary) {
				var errorsArray = getErrorsArray(summary);
				if (!errorsArray || !errorsArray.length) {
					log.debug('No errors encountered');
					return;
				}

				for (var i in errorsArray) {
					log.error('Error ' + i, errorsArray[i]);
				}

				if (errorsArray && errorsArray.length) {
					//
					// INSERT YOUR CODE HERE
					//
				}

				return errorsArray;

				// *********** HELPER FUNCTIONS ***********
				function getErrorsArray(summary) {
					var errorsArray = [];

					// *********** HELPER FUNCTIONS ***********
					function getErrorString(e) {
						var errorString = '';
						var errorObj = JSON.parse(e);
						if (errorObj.type == 'error.SuiteScriptError' || errorObj.type == 'error.UserEventError') {
							errorString = errorObj.name + ': ' + errorObj.message;
						}
						else {
							errorString = e;
						}
						return errorString;
					}
				}
			}

			function handleSummaryOutput(output) {
				var contents = '';
				output.iterator().each(function (key, value) {
					contents += (key + ' ' + value + '\n');
					return true;
				});
				if (contents) {
					log.debug('output', contents);
				}
			}
		}

		/**
		* Validate Object's property
		*
		* @Param {Object} obj - Object of properties to validate
		* @Param {boolean} inclFalse - Is "false" invalid too?
		*/
		function isObjPropValid(obj, inclFalse) {
			var res = true;
			if (
				typeof inclFalse === 'boolean' &&
				typeof obj === 'object' &&
				Object.keys(obj).length > 0
			) {
				for (var k in obj) {
					if (inclFalse === true) {
						if (obj[k] === false) {
							res = false;
							break;
						}
						if (
							obj[k] === '' ||
							obj[k] === null ||
							obj[k] === undefined ||
							typeof obj[k] === 'undefined' ||
							JSON.stringify(obj[k]) === 'null' ||
							JSON.stringify(obj[k]) === '[]'
						) {
							res = false;
							break;
						}
					}
				}
			} else {
				throw ('Invalid parameter');
			}
			return res;
		}

		/**
		 * Converts string to integer. If value is infinity or can't be converted to a number, 0 will be returned.
		 * @param {String} stValue - any string
		 * @returns {Number} - an integer
		 * @author jsalcedo
		 * revision: gmanarang - added parameter on parseInt to ensure decimal as base for conversion
		 */
		forceParseInt = function (stValue) {
			var intValue = parseInt(stValue, 10);

			if (isNaN(intValue) || (stValue == Infinity)) {
				return 0;
			}

			return intValue;
		}

		/**
		 * Converts string to float. If value is infinity or can't be converted to a number, 0.00 will be returned.
		 * @param {String} stValue - any string
		 * @returns {Number} - a floating point number
		 * @author jsalcedo
		 */
		forceParseFloat = function (stValue) {
			var flValue = parseFloat(stValue);

			if (isNaN(flValue) || (stValue == Infinity)) {
				return 0.00;
			}

			return flValue;
		}


		return {
			getInputData: getInputData,
			map: map,
			reduce: reduce,
			summarize: summarize
		};
	});