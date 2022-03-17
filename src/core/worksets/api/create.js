'use strict';
const Find = require('./find');

/**
 * Create workset class
 */
class Create {
  constructor(occ) {
    this._occ = occ;

    // api depedencies
    this.api = {
      find: new Find(this._occ)
    }
  }

  /**
   * Creates a new workset using the provided name
   * If the workset already exists, then, it wont
   * try to create a new workset.
   *
   * @param   {String}  name The workset name
   *
   * @return  {Object} response The workset response
   * @return  {Boolean} response.alreadyCreated tells if the workset was already created
   * @return  {Array} response.worksets Array of the existing/recently created worksets
   */
  async new(name) {
    const response = {
      alreadyCreated: false,
      worksets: []
    };

    const alreadyCreatedWorkset = await this.api.find.byName(name);
    const NAME_LIMIT = 25;

    name = name.substring(0, NAME_LIMIT);

    if(alreadyCreatedWorkset.length) {
      response.alreadyCreated = true;
      response.worksets = alreadyCreatedWorkset;
    } else {
      const requestOptions = {
        api: `/worksets`,
        method: 'post',
        body: {
          name
        }
      };
      response.worksets = [await this._occ.promisedRequest(requestOptions)];
    }

    return response;
  }
}

module.exports = Create;
