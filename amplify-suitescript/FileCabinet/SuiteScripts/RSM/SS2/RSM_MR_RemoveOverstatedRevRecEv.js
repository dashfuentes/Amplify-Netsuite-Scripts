/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/util', 'N/runtime','N/record', '../lodash'], function(search, util, runtime, record, _) {
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
    // config: {
    //     retryCount: 3
    //     , exitOnError: false
    // }
    getInputData: getInputData,
    map: mapStage,
    // reduce: reduce,
    summarize: summarize
  };
});
