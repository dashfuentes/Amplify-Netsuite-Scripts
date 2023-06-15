/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/util', 'N/runtime','N/record', 'N/query', '../lodash'], function(search, util, runtime, record, query, _) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    var ssid = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_ss_id'});
    if(!ssid) {
      throw new Error("The Script parameter custscript_rsm_mr_ss_id was not provided!")
    }

    return search.load({id: ssid});
  }

  /**
   * @description Executes when the map entry point is triggered and applies to each key/value pair.
   * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
   */
  function mapStage(context) {
    var data = util.isObject(context.value) ? context.value : JSON.parse(context.value);
    log.debug('context.value', data);

    try {
      var recordId = data.id;

      // Checking if the Event Revenue Record is linked to an IFF
      var iffResults = query
        .runSuiteQL({
          query: "SELECT \
            IFF.id, \
            IFIT.custcol_rsm_product_id, \
            IFIT.custcol_rev_event_rec \
          FROM Transaction AS IFF \
          INNER JOIN TransactionLine IFIT ON (IFF.id = IFIT.transaction) \
          WHERE IFF.type = 'ItemShip' \
            AND BUILTIN.DF(IFF.status) = 'Item Fulfillment : Shipped' \
            AND IFIT.custcol_rev_event_rec = ?",
          params: [recordId]
        })
        .asMappedResults();
      log.debug("iffResults", iffResults);

      // If the Event Revenue Record is linked to an IFF, remove it from the IFF
      if(iffResults && iffResults.length > 0) {
        _.forEach(iffResults, function(iffr){
          var loadIFRecord = record.load({
            type: "itemfulfillment",
            id: iffr.id
          });
          log.debug("record", JSON.stringify(loadIFRecord));

          // Looking for line index
          var linesCount = loadIFRecord.getLineCount("item");
          log.debug("count item", linesCount);

          for (var index = 0; index < linesCount; index++) {
            var revenueRecEvId = loadIFRecord.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_rev_event_rec",
              line: index,
            });

            // Cleaning Rev Rec Ev column Item Line
            if(revenueRecEvId == iffr.custcol_rev_event_rec) {
              loadIFRecord.setSublistValue({ sublistId: "item", line: index, fieldId: 'custcol_rev_event_rec', value: '' });
              loadIFRecord.save();
              return false;
            }
          }
        });
      }

      record.delete({
        type: 'billingrevenueevent',
        id: recordId,
      });

      log.debug("mapStatge", "Deleted revenue recognition event with ID: " + recordId);
    } catch (e) {
      log.error('Map/Reduce Script error', e);
    }

    return 'map complete';
  }

  /**
   * @description Executes when the reduce entry point is triggered and applies to each group.
   * @param {ReduceSummary} context - Data collection containing the groups to process through the reduce stage
   */
  function reduce(context) {
    // _reduceContext.write({
    //   key: _reduceContext.key
    //   , value: _reduceContext.values
    // });
  }

  /**
   * @description Executes when the summarize entry point is triggered and applies to the result set.
   * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
   */
  function summarize(summary) {
    // summarize totals
    log.audit('summary', summary);
    log.audit('input stage summary', summary.inputSummary);
    log.audit('map stage summary', summary.mapSummary);
    log.audit('reduce stage summary', summary.reduceSummary);
    _.forEach(summary.output.iterator(), function(k, v) {
      log.audit('summary.output key,value', k + ', ' + v);
      return true;
    });
  }

  return {
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize
  };
});
