const _waitForRenderComplete = window.waitForRenderComplete;
window.waitForRenderCompleteBeingProcessed = false;

window.waitForRenderComplete = function (ko, layoutContainer, masterViewModel) {
  window.waitForRenderCompleteBeingProcessed = true;

  const processMasterViewModelData = () => {
    const widgets = layoutContainer.widgets;

    Object.keys(oe.widgets).forEach(widgetItemId => {
      const localWidget = oe.widgets[widgetItemId];
      const localWidgetData = localWidget.widgetConfig;

      Object.keys(widgets).forEach(remoteWidgetItemId => {
        const remoteWidgetData = widgets[remoteWidgetItemId];
        const localWidgetConfig = localWidgetData.config;
        const localWidgetConfigsList = localWidgetConfig ? Object.keys(localWidgetConfig) : [];

        if(remoteWidgetData.widgetId().indexOf(widgetItemId) > -1 && localWidgetConfigsList.length) {
          localWidgetConfigsList.forEach(localWidgetConfigKey => {
            remoteWidgetData[localWidgetConfigKey] = ko.observable(localWidgetConfig[localWidgetConfigKey]);
          });
        }
      });
    });

    waitForRenderCompleteBeingProcessed = false;

    if(typeof _waitForRenderComplete === 'function') {
      _waitForRenderComplete.apply(this, arguments);
    }
  };

  if(masterViewModel.data) {
    processMasterViewModelData();
  } else {
    const intervalId = setInterval(() => {
      if(masterViewModel.data) {
        processMasterViewModelData();
        clearInterval(intervalId);
      }
    }, 50);
  }
}
