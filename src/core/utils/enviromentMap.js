const ENVIROMENTS = {
  'c4tst': {
    name: 'SIT'
  },
  'c5tst': {
    name: 'UAT'
  },
  'c2tst': {
    name: 'DEV'
  },
  'c1prd': {
    name: 'PROD'
  }
}

/**
 * 
 * @param {String} env name like in url
 * @returns name like SIT UAT etc..
 */
module.exports = (env) => {
    return ENVIROMENTS[env].name;
};
  