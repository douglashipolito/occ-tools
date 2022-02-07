const util = require('util');
const Cmdln = require('cmdln').Cmdln;
const winston = require('winston');
const PageTagsCore = require('../core/page-tags');

function PageTags() {
  Cmdln.call(this, {
    name: 'occ-tools page-tags',
    desc: 'Page Tags Operations.'
  });
}

util.inherits(PageTags, Cmdln);

PageTags.prototype.do_list = function(_subcmd, opts, args, callback) {
  const pageTags = new PageTagsCore('admin');
  const area = args[0];
  const query = opts.query;

  pageTags.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  pageTags.on('error', function(error) {
    return callback(error);
  });

  pageTags.list({
    area,
    tagId: opts.tagId,
    query
  });
};

PageTags.prototype.do_list.help = (
  'List all tags from the specified area.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <area> [options] \n\n' +
  '{{options}}'
);

PageTags.prototype.do_list.options = [
  {
    names: ['tagId', 't'],
    helpArg: '<tagId>',
    type: 'string',
    default: false,
    help: '(Optional) The Tag id to be fetched (default: false).'
  },
  {
    names: ['query', 'q'],
    helpArg: '<query>',
    type: 'string',
    default: false,
    help: '(Optional) SCIM Query to filter out the result.'
  }
];

PageTags.prototype.do_create = function(_subcmd, opts, args, callback) {
  const pageTags = new PageTagsCore('admin');
  const area = args[0];
  const { file, type, order, name, enabled, append_version } = opts;

  if(!file) {
    return callback('You must provide a js file path by using the argument --file=<filePath>');
  }

  pageTags.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  pageTags.on('error', function(error) {
    return callback(error);
  });

  pageTags.create({
    area,
    file,
    type,
    order,
    name,
    enabled,
    appendVersion: append_version
  });
};

PageTags.prototype.do_create.help = (
  'Create tag(s) to the specified area.\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <area> [options] \n\n' +
  '{{options}}'
);

PageTags.prototype.do_create.options = [
  {
    names: ['file', 'f'],
    helpArg: '<file>',
    type: 'string',
    default: false,
    help: '(Required) The JS File path. This must be available inside the /files folder'
  },
  {
    names: ['name', 'n'],
    helpArg: '<name>',
    type: 'string',
    default: false,
    help: '(Optional) The name of the page tag. In case of multiple sites, a suffix -siteId will be added, such as "my-file-siteUS". Default value is the filename'
  },
  {
    names: ['type', 't'],
    helpArg: '<type>',
    type: 'string',
    default: 'file',
    help: '(Optional) This will set the script using "src" or in the script body. Valid values: file or content. Default(file)'
  },
  {
    names: ['order', 'o'],
    helpArg: '<order>',
    type: 'string',
    default: false,
    help: '(Optional) Sets the order of the script.'
  },
  {
    names: ['enabled', 'e'],
    helpArg: '<enabled>',
    type: 'bool',
    default: true,
    help: '(Optional) Defines if the page tag will be enabled by default.'
  },
  {
    names: ['append-version', 'a'],
    helpArg: '<append-version>',
    type: 'bool',
    default: false,
    help: '(Optional) If true, appends the assets version in the script tag.'
  }
];

PageTags.prototype.do_delete = function(_subcmd, opts, args, callback) {
  const pageTags = new PageTagsCore('admin');
  const area = args[0];
  const query = opts.query;
  const tagId = opts.tagId;

  if(!query && tagId) {
    return callback('You must provide the --tagId=<id> or --query=<SCIM Query> for the delete');
  }

  pageTags.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  pageTags.on('error', function(error) {
    return callback(error);
  });

  pageTags.delete({
    area,
    tagId,
    query
  });
};

PageTags.prototype.do_delete.help = (
  'Delete the specified tag(s).\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <area> [options] \n\n' +
  '{{options}}'
);

PageTags.prototype.do_delete.options = [
  {
    names: ['tagId', 't'],
    helpArg: '<tagId>',
    type: 'string',
    default: false,
    help: '(Optional) The Tag id to be deleted (default: false).'
  },
  {
    names: ['query', 'q'],
    helpArg: '<query>',
    type: 'string',
    default: false,
    help: '(Optional) SCIM Query to find the tags to be deleted.'
  }
];

PageTags.prototype.do_update = function(_subcmd, opts, args, callback) {
  const pageTags = new PageTagsCore('admin');
  const area = args[0];
  const { file, type, order, enabled, tagId, query, append_version } = opts;

  if(!file) {
    return callback('You must provide a js file path by using the argument --file=<filePath>');
  }

  if(!query && tagId) {
    return callback('You must provide the --tagId=<id> or --query=<SCIM Query> for the update');
  }

  pageTags.on('complete', function(message) {
    winston.info(message);
    return callback();
  });

  pageTags.on('error', function(error) {
    return callback(error);
  });

  pageTags.update({
    area,
    file,
    type,
    order,
    enabled,
    tagId,
    query,
    appendVersion: append_version
  });
};

PageTags.prototype.do_update.help = (
  'Update the specified tag(s).\n\n' +
  'Usage:\n' +
  '     {{name}} {{cmd}} <area> [options] \n\n' +
  '{{options}}'
);

PageTags.prototype.do_update.options = [
  {
    names: ['tagId', 't'],
    helpArg: '<tagId>',
    type: 'string',
    default: false,
    help: '(Optional) The Tag id to be deleted (default: false).'
  },
  {
    names: ['query', 'q'],
    helpArg: '<query>',
    type: 'string',
    default: false,
    help: '(Optional) SCIM Query to find the tags to be deleted.'
  },
  {
    names: ['file', 'f'],
    helpArg: '<file>',
    type: 'string',
    default: false,
    help: '(Required) The JS File path. This must be available inside the /files folder'
  },
  {
    names: ['type', 'r'],
    helpArg: '<type>',
    type: 'string',
    default: 'file',
    help: '(Optional) This will set the script using "src" or in the script body. Valid values: file or content. Default(file)'
  },
  {
    names: ['order', 'o'],
    helpArg: '<order>',
    type: 'string',
    default: false,
    help: '(Optional) Sets the order of the script.'
  },
  {
    names: ['enabled', 'e'],
    helpArg: '<enabled>',
    type: 'bool',
    default: true,
    help: '(Optional) Defines if the page tag will be enabled by default.'
  },
  {
    names: ['append-version', 'a'],
    helpArg: '<append-version>',
    type: 'bool',
    default: false,
    help: '(Optional) If true, appends the assets version in the script tag.'
  }
];

module.exports = PageTags;
