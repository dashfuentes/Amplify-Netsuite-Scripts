/**
 * @description
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/util', 'N/runtime','N/record', 'N/task', '../lodash'], function(search, util, runtime, record, task, _) {
  /**
   * @description Marks the beginning of the Map/Reduce process and generates input data.
   * @typedef {Object} ObjectRef
   * @property {number} id - Internal ID of the record instance
   * @property {string} type - Record type id
   * @return {Array|Object|Search|RecordRef} inputSummary
   */
  function getInputData() {
    var ssid = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_mr_ss_revrecplanid'});
    if(!ssid) {
      throw new Error("The Script parameter custscript_rsm_mr_ss_revrecplanid was not provided!")
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
      var revenuePlanId = data["values"]["internalid.revenuePlan"].value;
      record.delete({
        type: 'revenueplan',
        id: revenuePlanId,
      });

      log.debug("mapStatge", "Deleted revenue plan with ID: " + revenuePlanId);

      context.write({ key: revenuePlanId, value: revenuePlanId });
    } catch (e) {
      log.error('Map/Reduce Script error', e);
    }
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
    var data = [];
    _.forEach(summary.output.iterator(), function(k, v) {
      data.push(v);
      log.audit('summary.output key,value', k + ', ' + v);
      return true;
    });

    // if(data.length > 0) {
    //   const mrTask = task.create({
    //     taskType: task.TaskType.MAP_REDUCE,
    //     scriptId: 'customscript_rsm_mr_removeosrevrecev'
    //   })
    //   mrTask.submit()
    //   log.debug('Map Reduce Task', 'The map reduces has been tasked')
    // }
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
