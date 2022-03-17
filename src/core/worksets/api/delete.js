'use strict';
const Find = require('./find');

/**
 * Delete workset class
 */
class Delete {
  constructor(occ) {
    this._occ = occ;

    // api depedencies
    this.api = {
      find: new Find(this._occ)
    }
  }

  /**
   * Make the api call to the workset delete endpoint
   *
   * @param   {String}  id  the Id of the workset
   *
   * @return  {Promise<OCC Response>} returns the response from the server
   */
  async makeDelete(id) {
    const requestOptions = {
      api: `/worksets/${id}`,
      method: 'delete'
    };

    return await this._occ.promisedRequest(requestOptions);
  }

  /**
   * Deletes the workset based on the provided type, meaning
   * if the type is "id", then, the found "id" will be deleted
   * if the type is "name", then the found workset's name will be deleted
   *
   * @param   {String}  type   the type of the "value" param, this must be "id" or "name"
   * @param   {String}  value  the identificator of the workset, can be the "name" or the"id"
   *                           of the workset
   *
   * @return  {Object} response The workset response
   * @return  {Boolean} response.success tells if the workset was deleted with success
   * @return  {String} response.message the message based on the success of the action
   */
  async deleteByType(type, value) {
    const response = {
      success: false,
      message: ''
    };

    const findResults = await this.api.find.findByType(type, value);
    const findResultsResponse = findResults.response;

    if(!findResultsResponse) {
      response.message = findResults.message;
      return response;
    }

    for(const result of findResultsResponse) {
      await this.makeDelete(result.repositoryId);
    }

    response.success = true;
    response.message = "Successfully deleted worksets";
    return response;
  }
}

module.exports = Delete;
