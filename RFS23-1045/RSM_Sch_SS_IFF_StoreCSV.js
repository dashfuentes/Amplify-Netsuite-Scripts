/**
 * @description Ticket: RFS23-1045, Script to store saved searches as CSV
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/log', 'N/runtime', 'N/task', '../lodash', '../moment'], function (log, runtime, task, _, moment) {
  function execute(context) {
    try {
      var filePath = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_sch_csv_folderpath'});
      var ssIDsStr   = runtime.getCurrentScript().getParameter({ name: 'custscript_rsm_sch_csv_ssids'});

      if(!filePath) throw new Error('The script parameter custscript_rsm_sch_csv_folderpath was not set up!');
      if(!ssIDsStr) throw new Error('The script parameter custscript_rsm_sch_csv_ssids was not set up!');

      var now   = moment();
      var ssIDs = JSON.parse(ssIDsStr);
      _.forEach(ssIDs, function(ssid) {
        var filename = filePath + '/' + now.format('YYYYMMDD') + '_' + ssid.name + '.csv';
        var searchTask = task.create({
            taskType: task.TaskType.SEARCH,
            savedSearchId: ssid.id,
            filePath: filename
        });
        searchTask.submit();

        log.debug('CSV created', 'The CSV "' + filename + '" was successfully created!');
      });
      log.debug('Schedule script message', 'The CSV saved searches were successfully created!');
    } catch(e) {
      log.error('Schedule script error', e);
    }
    log.debug('Schedule Script', 'Schedule Script');
  }

  return {
    execute: execute
  };
});
