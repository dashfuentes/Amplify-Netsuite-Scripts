/**
 * @description 
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * This script will process Fullfillment RMA only to do updates on the BSO
 */
define([
  "N/file",
  "N/log",
  "N/record",
  "N/query",
  "N/runtime",
  "../lodash",
  "N/search",
], function (file, log, record, query, runtime, _, search) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    // var transactionId = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_rma_id'});
    // log.debug('transaction id from MR', transactionId)
    var returnauthorizationSearch = search.create({
      type: "returnauthorization",
      filters: [
        ["type", "anyof", "RtnAuth"],
        "AND",
        ["custbody_rsm_process_revenue_event", "is", "T"],
        "AND",
        ["custbody_rsm_rma_type", "anyof", "2"],
        "AND",
        ["mainline", "is", "T"],
      ],
      columns: [
        search.createColumn({ name: "internalid", label: "Internal ID" }),
      ],
    });

    return returnauthorizationSearch;
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    log.debug("MAP input", context.value);
    try {
      var input = JSON.parse(context.value);
      log.debug("transaction from map", input);
      var transactionId = input.id;

      //  var newRecord = context.newRecord;
      var loadRMATransaction = record.load({
        type: "returnauthorization",
        id: transactionId,
      });

      log.debug("*** It is a Fullfillment RMA Transaction ***");

      var linesCount = loadRMATransaction.getLineCount("item");
      //log.debug("count item", linesCount);
      var BSOTransactionId = loadRMATransaction.getValue(
        "custbody_rsm_blank_ord_created"
      );
      log.debug("bso-transaction", BSOTransactionId);
      var isReShip = loadRMATransaction.getValue("custbody_rsm_reship");
      var RMAItemInfo = [];

      for (var index = 0; index < linesCount; index++) {
        var itemId = loadRMATransaction.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });

        var itemQty = loadRMATransaction.getSublistValue({
          sublistId: "item",
          fieldId: "quantity",
          line: index,
        });

        RMAItemInfo.push({ id: itemId, qty: itemQty });
      }

      //Load the BSO in order to update some information

      var BSOTransaction = record.load({
        type: "customsale_rsm_blanket_order_bso",
        id: BSOTransactionId,
      });

      var BSOLineCount = BSOTransaction.getLineCount("item");

      for (var index = 0; index < BSOLineCount; index++) {
        var BSOItemId = BSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_product_id",
          line: index,
        });

        var BSOQtyPendingReturn = BSOTransaction.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_rsm_qty_pend_return",
          line: index,
        });

        var findRMATransactionLine = _.find(RMAItemInfo, function (line) {
          return line.id === BSOItemId;
        });
        log.debug("after find transaction line", findRMATransactionLine);
        if (
          findRMATransactionLine &&
          findRMATransactionLine !== "undefined" &&
          BSOItemId == findRMATransactionLine.id
        ) {
          //Increase Qty Pending Return

          var pendingQtyReturn =
            BSOQtyPendingReturn + findRMATransactionLine.qty;
          BSOTransaction.setSublistValue({
            sublistId: "item",
            fieldId: "custcol_rsm_qty_pend_return",
            line: index,
            value: pendingQtyReturn,
          });
        }
      }

      loadRMATransaction.setValue({
        fieldId: "custbody_rsm_process_revenue_event",
        value: false,
      });

      loadRMATransaction.save();

      log.debug("** After save the transaction **");

      return;
      //  }
    } catch (e) {
      log.error("Map Reduce Script error", e);
    }

    return "map complete";
  }

  /**
   * @description Executes when the reduce entry point is triggered and applies to each group.
   * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
   */
  function reduce(context) {
    // _reduceContext.write({
    //   key: _reduceContext.key ,
    //   value: _reduceContext.values
    // });
  }

  /**
   * @description Executes when the summarize entry point is triggered and applies to the result set.
   * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
   */
  function summarize(summary) {
    // summarize totals
    log.audit("summary", summary);
    log.audit("input stage summary", summary.inputSummary);
    log.audit("map stage summary", summary.mapSummary);
    log.audit("reduce stage summary", summary.reduceSummary);
    _.forEach(summary.output.iterator(), function (k, v) {
      log.audit("summary.output key,value", k + ", " + v);
      return true;
    });
    log.error("errors", JSON.stringify(summary.mapSummary.errors));
  }

  return {
    config: {
      retryCount: 3,
      exitOnError: false,
    },
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize,
  };
});
