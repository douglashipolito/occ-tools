"use strict";

let _sitesIdsCache = null;

module.exports = function (sitesIds) {
  const self = this;

  return new Promise((resolve, reject) => {
    if (_sitesIdsCache) {
      return resolve(_sitesIdsCache);
    }

    if (typeof sitesIds === "string") {
      const ids = sitesIds.split(",");
      _sitesIdsCache = ids;
      return resolve(ids);
    }

    self._occ
      .promisedRequest(`sites`)
      .then((response) => {
        const ids = response.items.map((item) => item.repositoryId);
        _sitesIdsCache = ids;

        resolve(_sitesIdsCache);
      })
      .catch((e) => reject(e));
  });
};
