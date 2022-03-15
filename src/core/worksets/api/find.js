'use strict';

/**
 * Find workset class
 */
class Find {
  constructor(occ) {
    this._occ = occ;
  }

  /**
   * Finds all worksets
   *
   * @param   {Object}  options        options for the workset get endpoint
   * @param   {String}  options.query  The SCIM query for the GET worksets endpoint
   *
   * @return  {Array} items The response items from the server
   */
  async all(options) {
    const requestOptions = {
      api: '/worksets',
      method: 'get',
    };

    if(options.query) {
      requestOptions.qs = {
        q: options.query
      }
    }

    const responseFromServer = await this._occ.promisedRequest(requestOptions);
    return responseFromServer.items;
  }

  /**
   * Search for the correct find based on the provided type, valid types: id, name
   *
   * @param   {String}  type The type of the finder, name or ir
   *
   * @return  {Function} The method inside this class matching the pattern "by{Type}"
   *                     such as "this.byId"
   */
  getFinderByType(type) {
    const finderName = `by${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    const finder = this[finderName].bind(this);

    if(!finder) {
      throw new Error(`No method found in FIND class with the name "${finderName}"`);
    }

    return finder;
  }

  /**
   * Search for some workset based on the type and provided value.
   * if the type is "id", then, the found workset matching the provided "id" will be returned
   * if the type is "name", then the found workset matching the provided "name" will be returned
   *
   * @param   {String}  type   the type of the "value" param, this must be "id" or "name"
   * @param   {String}  value  the identificator of the workset, can be the "name" or the"id"
   *                           of the workset
   *
   * @return  {Object} responseData The workset response
   * @return  {Boolean} responseData.success Tells if the workset was deleted with success
   * @return  {String} responseData.message The message based on the success of the action
   * @return  {Array} responseData.response The response from the server
   */
  async findByType(type, value) {
    const isId = type === 'id';
    const isName = type === 'name';

    const responseData = {
      success: false,
      message: '',
      response: null
    };

    let finder;
    try {
      finder = this.getFinderByType(type);
    } catch(error) {
      responseData.message = error.message;
      return responseData;
    }

    let findResults = await finder(value);

    if((isName && !findResults.length) || (isId && !findResults.success)) {
      responseData.message = `Workset ${type} "${value}" has not been found.`;
      return responseData;
    }

    if(!Array.isArray(findResults)) {
      findResults = [findResults.data];
    }

    responseData.response = findResults;
    return responseData;
  }

  /**
   * Makes the api requests using the provided ID
   *
   * @param   {String}  id  Workset's id
   *
   * @return  {Object} response The workset response
   * @return  {Boolean} responseData.success Tells if the workset was deleted with success
   * @return  {Object} responseData.data The response from the server
   */
  async byId(id) {
    let response = {
      success: false,
      data: null
    };

    const requestOptions = {
      api: `/worksets/${id}`,
      method: 'get',
    };

    try {
      const serverResponse = await this._occ.promisedRequest(requestOptions);
      response.success = true;
      response.data = serverResponse;
    } catch(error) {
      response.data = error.message;
    }

    return response;
  }

  /**
   * Makes the api requests using the provided Name
   * It will search for the provided workset's name and return a list
   * of the found worksets
   *
   * @param   {String}  name  Workset's name
   *
   * @return  {Array} The list of found worksets
   */
  async byName(name) {
    return await this.all({
      query: `name co "${name}"`
    });
  }
}

module.exports = Find;
