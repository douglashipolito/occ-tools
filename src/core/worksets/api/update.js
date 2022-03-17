'use strict';
const Find = require('./find');

/**
 * Update workset class
 */
class Update {
  constructor(occ) {
    this._occ = occ;

    // api depedencies
    this.api = {
      find: new Find(this._occ)
    }
  }

  /**
   * Make the api call to the workset update endpoint
   *
   * @param   {String}  id    The Id of the workset
   * @param   {String}  name  The new Name
   *
   * @return  {Promise<OCC Response>} returns the response from the server
   */
  async makeChange(id, name) {
    const requestOptions = {
      api: `/worksets/${id}`,
      method: 'put',
      body: {
        name
      }
    };

    return await this._occ.promisedRequest(requestOptions);
  }

  /**
   * Updates the workset based on the provided type, meaning
   * if the type is "id", then, the found "id" will be updated
   * if the type is "name", then the found workset's name will be updated
   *
   * @param   {String}  type   The type of the "value" param, this must be "id" or "name"
   * @param   {String}  value  The identificator of the workset, can be the "name" or the"id"
   *                           of the workset
   * @param   {String}  name   The new name for the workset
   *
   * @return  {Object} response The workset response
   * @return  {Boolean} response.success tells if the workset was deleted with success
   * @return  {String} response.message the message based on the success of the action
   */
  async change(type, value, name) {
    const response = {
      success: false,
      message: ''
    };

    const existingWorkset = await this.api.find.findByType(type, value);
    const existingWorksetResponse = existingWorkset.response;

    if(!existingWorksetResponse) {
      response.message = existingWorkset.message;
      return response;
    }

    for(const result of existingWorksetResponse) {
      await this.makeChange(result.repositoryId, name);
    }

    response.success = true;
    response.message = "Successfully updated worksets";
    return response;
  }
}

module.exports = Update;
