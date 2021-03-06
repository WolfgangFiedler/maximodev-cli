/*
 * Copyright (c) 2018-present, IBM CORP.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var log = require('./logger');
var fs = require('fs-extra');
var templates = require('./templates');
var dbcscripts = require('./dbcscripts');
var xmlutil = require('./xml');
var env = require('./env');
var util = require('util');

var productxml = module.exports = Object.create({});
/**
 * Creates a new product xml from the template args and write to outFile.  If outFile is not a .in templated file
 * then .in will be added, since, product xml files require further template processing during the build phase
 *
 * @param args
 * @param outFile
 * @returns {number} -1 if the file was not created
 */
productxml.newProductXml = function (args, outFile) {
  if (!outFile.endsWith('.in')) {
    // make this a templated file
    outFile += '.in';
  }

  if (fs.existsSync(outFile)) {
    log.error("product xml %s already exists and will not be overwritten", outFile);
    return -1;
  }

  var tplArgs = {};
  tplArgs.addon_id = args.addon_id;
  tplArgs.addon_description = args.addon_description;

  // TODO: do we need any length validation here
  tplArgs.maxvar_name = tplArgs.addon_id;
  tplArgs.dbversion = '{{dbversion}}';
  tplArgs.dbscripts = tplArgs.addon_id;

  parseVersion(tplArgs, args.addon_version);

  tplArgs.last_dbversion = util.format("V%s%s%s%s-00", tplArgs.version_major, tplArgs.version_minor, tplArgs.version_modlevel, tplArgs.version_patch);

  templates.renderToFile('product/product.xml.in', tplArgs, outFile);
  log.info("created product xml: %s", outFile);
};

/**
 * update the templated fields in in the product xml based on the last script in the script dir
 *
 * @param productxmlIn
 * @param scriptsDir
 */
productxml.updateVersion = function (productxmlIn, scriptsDir) {
  if (!productxmlIn.endsWith(".in")) productxmlIn += '.in';
  var lastVer = dbcscripts.script(dbcscripts.lastScript(scriptsDir));
  if (!lastVer) {
    log.warn("No scripts.  Can't update versions.");
    return;
  }
  var args = {
    dbversion: util.format('%s%s-%s', lastVer.prefix, lastVer.version, ("" + lastVer.number).padStart(2, "0")),
    build_number: env.buildNumber()
  };

  templates.renderToFile(productxmlIn, args);
  log.info("updated dbversion to %s for %s", args.dbversion, productxmlIn);
};
/**
 * Add a Field Class Extension
 * @param {*} mbo 
 * @param {*} field 
 * @param {*} existingClass 
 * @param {*} newClass 
 */
productxml.addFieldExtension = function (mbo, field, existingClass, newClass) {
  // <field objectname='PM' attributename='JPNUM' extends='psdi.app.pm.FldPMJpnum'>bpaaa.pm.CustFldPMJpnum</field>

  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "field", {
      objectname: mbo,
      attributename: field,
      extends: existingClass
    }, newClass);
    var changed = false;
    if (!xmlutil.hasNode(xml, "field", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });
};

/**
 *  Add a RMI Remote Service extension for the addon.
 * @param {*} mbo 
 * @param {*} serviceName 
 * @param {*} existingClass 
 * @param {*} newClass 
 */
productxml.addRemoteServiceExtension = function (serviceName, existingClass, newClass) {
  //<class extends='{{original_service_fqn}}Remote' >{{user_service_fqn}}SetRemote</class>
  //Extends the Remote class for a Mbo
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "class", {
      extends: existingClass,
    }, newClass);
    var changed = false;
    if (!xmlutil.hasNode(xml, "class", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });
};
/**
 * Add service extension
 * @param {*} serviceName 
 * @param {*} existingClass 
 * @param {*} newClass 
 */
productxml.addServiceExtension = function (serviceName, existingClass, newClass) {
  //<service servicename='{{original_service_name}}' extends='{{original_service_fqn}}'>{{user_service_fqn}}</service>
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "service", {
      servicename: serviceName,
      extends: existingClass
    }, newClass);
    var changed = false;
    if (!xmlutil.hasNode(xml, "service", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });
};

/**
 * Extends the MBO (Maximo Business Objects) Structure for a mboSet
 * @param {*} objectname 
 * @param {*} existingClass 
 * @param {*} newClass 
 */
productxml.addMboExtension = function (objectname, existingClass, newClass) {
  //<class extends='{{original_mbo_fqn}}Remote' >{{user_mbo_fqn}}Remote</class>
  //<mbo objectname='{{original_object_name}}' extends='{{original_mbo_fqn}}'>{{user_mbo_fqn}}</mbo>

  //Extends the Remote class for a Mbo
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "class", {
      extends: existingClass + 'Remote',
    }, newClass + 'Remote');
    var changed = false;
    if (!xmlutil.hasNode(xml, "class", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });

  //<class extends='{{original_mbo_fqn}}SetRemote' >{{user_mbo_fqn}}SetRemote</class>
  //<mbo objectname='{{original_object_name}}' extends='{{original_mbo_fqn}}Set'>{{user_mbo_fqn}}Set</mbo>
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "mbo", {
      objectname: objectname,
      extends: existingClass
    }, newClass);
    var changed = false;
    if (!xmlutil.hasNode(xml, "mbo", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });

  //Extends the MboSetRemote classes for a MboSet
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "class", {
      extends: existingClass + 'SetRemote',
    }, newClass + 'SetRemote');
    var changed = false;
    if (!xmlutil.hasNode(xml, "class", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });

  //Add extension for a MboSet
  xmlutil.update(env.productXmlIn(), function (xml) {
    var el = xmlutil.createElement(xml, "mboset", {
      objectname: objectname ,
      extends: existingClass+'Set'
    }, newClass + 'Set');
    var changed = false;
    if (!xmlutil.hasNode(xml, "mboset", function (e) {
      return e.textContent.trim() == newClass;
    })) {
      xmlutil.appendChild(xml, xml.getElementsByTagName("extensions")[0], el, "  ", "\n  ");
      changed = true;
    }
    return changed;
  });
};

function parseVersion(tplArgs, version) {
  var parts = version.split('.');
  if (parts.length !== 4) {
    throw Error(util.format('Version must be a 4 part version number, ie, 7.6.1.0.  This version is %s', version));
  }
  tplArgs.version_major = parts[0];
  tplArgs.version_minor = parts[1];
  tplArgs.version_modlevel = parts[2];
  tplArgs.version_patch = parts[3];
  tplArgs.version_buildnumber = '{{build_number}}';
}
