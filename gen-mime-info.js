#!/usr/bin/env node
/**
 * (c) Rob Wu <rob@robwu.nl> (https://robwu.nl)
 *
 * Generates i18n strings and MIME-mappings from the shared mime-info database.
 *
 * 1. Add extra MIME-types by copying files from /usr/share/mime/packages to shared-mime-info.
 *    and put add the file to the inputFiles array (see below).
 * 2. Copy custom icons to icons/
 * 3. Run this script. Done!
 */

/* eslint-env node */
'use strict';

var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js');
var mkdirSync = require('mkdirp').sync;

//
// Begin config
//

var inputFileDirectory = path.resolve(__dirname, 'shared-mime-info');
var inputFiles = [
    'freedesktop.org.xml',
    'gcr-crypto-types.xml',
    'virtualbox.xml',
    'calibre.xml',
    'webp.xml',
    'mime.xml'
];
var extensionRoot = path.resolve(__dirname, 'extension');
var outputFile = path.join(extensionRoot, 'mime-metadata.js');
var iconPathPrefix = 'icons/'; // Relative to extensionRoot
var localePathPrefix = '_locales/mimetypes/'; // Relative to extensionRoot
var localePathSuffix = '.json';

// Used to exclude localized strings that are not supported by the CWS.
// Based on https://developers.google.com/chrome/web-store/docs/i18n?csw=1#localeTable
var i18n_supported_langs = [
    'ar', 'am', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'en_GB', 'en_US', 'es', 'es_419',
    'et', 'fa', 'fi', 'fil', 'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko',
    'lt', 'lv', 'ml', 'mr', 'ms', 'nl', 'no', 'pl', 'pt_BR', 'pt_PT', 'ro', 'ru', 'sk', 'sl', 'sr',
    'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'
];

//
// End of config
//

var inputFileIndex = -1;
process.nextTick(next);
function next() {
    var filename = inputFiles[++inputFileIndex];
    if (filename) {
        console.log('Processing ' + filename);
        filename = path.join(inputFileDirectory, filename);
        xml2mime(filename, next);
    } else {
        afterProcessingAllInputFiles();
    }
}
function afterProcessingAllInputFiles() {
    // Generate files for chrome.i18n
    Object.keys(i18n).forEach(function(locale) {
        var filename = path.join(extensionRoot, localePathPrefix + locale + localePathSuffix);
        // Pretty-print for better git diff
        var messages = JSON.stringify(i18n[locale], null, '\t');
        mkdirSync(path.dirname(filename));
        fs.writeFileSync(filename, messages);
    });

    // Generate metadata definitions
    // Assume that all icons are PNG files
    var iconNames = fs.readdirSync(path.join(extensionRoot, iconPathPrefix))
        .filter(function(name) { return (/\.png$/).test(name); })
        .map(function(name) { return name.replace('.png', ''); });

    var mimeMetadata = [
    '/* AUTOGENERATED - DO NOT EDIT */',
    '\'use strict\';',
    '/* exported mime_fromFilename, mime_getFriendlyName, mime_getIcon */',
    'function mime_fromFilename(filename) {',
    '\tvar mime;',
    '\tvar parts = filename.split(".");',
    '\tvar length = parts.length;',
    '\tif (length > 2) { // example.tar.gz',
    '\t\tmime = mimeMetadata.extensionToMime[parts[length - 2] + "." + parts[length - 1]];',
    '\t}',
    '\tif (!mime) { // example.txt',
    '\t\tmime = mimeMetadata.extensionToMime[parts[length - 1]];',
    '\t}',
    '\treturn mime ? mime_getMime(mime) : "";',
    '}',
    'var _cachedMimeMessages = {};',
    'function mime_getFriendlyName(mime, /*optional*/ locale) {',
    '\tmime = mime_getMime(mime);',
    '\tif (locale) {',
    '\t\tif (mimeMetadata.supportedLocales.indexOf(locale) === -1) locale = "en";',
    '\t\tvar messages = _cachedMimeMessages[locale];',
    '\t\tif (!messages) {',
    '\t\t\tvar x = new XMLHttpRequest();',
    '\t\t\tx.open("GET", "' + localePathPrefix + '" + locale + "' + localePathSuffix + '", false);',
    '\t\t\tx.send();',
    '\t\t\tmessages = _cachedMimeMessages[locale] = JSON.parse(x.responseText);',
    '\t\t}',
    '\t\treturn messages[mime];',
    '\t}',
    '\tlocale = navigator.language.replace("-", "_");',
    '\tif (mimeMetadata.supportedLocales.indexOf(locale) === -1) locale = locale.split("_")[0];',
    '\treturn mime_getFriendlyName(mime, locale) || mime_getFriendlyName(mime, "en");',
    '}',
    'function mime_getIcon(mime) {',
    '\tmime = mime_getMime(mime);',
    '\tvar icon = mime.replace(/\\//g, "-");',
    '\tif (mimeMetadata.nonGenericIcons.indexOf(icon) === -1) {',
    '\t\ticon = mimeMetadata.mimeToIcon[mime];',
    '\t\tif (!icon) icon = mime.split("/", 1)[0] + "-x-generic";',
    '\t}',
    '\treturn "' + iconPathPrefix + '" + icon + ".png";',
    '}',
    'function mime_getMime(mime) {',
    '\treturn mimeMetadata.aliases[mime] || mime;',
    '}',
    '',
    '/* eslint-disable max-len */',
    ];
    mimeMetadata = mimeMetadata.join('\n') + '\n';
    metadata.allMimeTypes.sort();
    metadata.nonGenericIcons = iconNames;
    metadata.supportedLocales = Object.keys(i18n);
    mimeMetadata += 'var mimeMetadata = ' + JSON.stringify(metadata, null, '\t') + ';\n';
    fs.writeFileSync(outputFile, mimeMetadata);
}

var metadata = {
    mimeToIcon: {},
    extensionToMime: {},
    aliases: {},
    allMimeTypes: [],
};
var i18n = {};


// Parse XML files from the Shared MIME-info database
// Duplicate entries are merged as follows:
// - The last icon takes the highest priority.
// - The last glob takes the highest priority.
// - The last alias takes the highest priority.
// - The first friendly name (i18n) takes the higest priority, all later definitions are ignored.
//
// See also:
// - /usr/share/mime/
// - http://freedesktop.org/wiki/Software/shared-mime-info/
// - http://standards.freedesktop.org/shared-mime-info-spec/shared-mime-info-spec-0.18.html
//
// Puts result in global variables metadata and i18n
function xml2mime(xmlFilename, /*function*/ done) {
    var xml = fs.readFileSync(xmlFilename, 'utf8');
    var parser = new xml2js.Parser();
    parser.parseString(xml, function(err, result) {
        if (err) {
            throw err;
        }
        // Get the identifier of the icon corresponding to the item
        var getIcon = function(/*object*/item, /*number*/i) {
            if (item.icon)
                return item.icon[0].$.name;
            if (item['generic-icon'])
                return item['generic-icon'][0].$.name;
            if (item['sub-class-of']) {
                var type = item['sub-class-of'][0].$.type;
                if (metadata.mimeToIcon[type])
                    return metadata.mimeToIcon[type];
                else
                    while (++i < items.length)
                        if (items[i].$.type === type)
                            return getIcon(items[i], i);
            }
        };
        var items = result['mime-info']['mime-type'];
        for (var i = 0; i < items.length; ++i) {
            var item = items[i];
            var mimeType = item.$.type;
            if (!mimeType) {
                console.warn('MIME type not found at index ' + i + '!');
                continue;
            }

            if (metadata.allMimeTypes.indexOf(mimeType) === -1) {
                metadata.allMimeTypes.push(mimeType);
            }

            var icon = getIcon(item, i);
            if (icon) {
                metadata.mimeToIcon[mimeType] = icon;
            }

            var extension = item.glob && item.glob[0].$.pattern;
            if (/^\*(?:\.[a-z0-9+]+){1,2}$/i.test(extension)) {
                extension = extension.slice(2).toLowerCase();
                metadata.extensionToMime[extension] = mimeType;
            }

            var aliases = item.alias;
            if (aliases) {
                for (var j = 0; j < aliases.length; ++j) {
                    // Assume that no previous aliases were defined
                    metadata.aliases[ aliases[j].$.type ] = mimeType;
                }
            }

            var comments = item.comment;
            if (comments) {
                for (var k = 0; k < comments.length; ++k) {
                    var comment = comments[k];
                    var lang = 'en'; // Default language
                    if (typeof comment !== 'string') {
                        lang = comment.$['xml:lang'];
                        comment = comment._;
                    }
                    if (i18n_supported_langs.indexOf(lang) === -1) {
                        // Skip unsupported language
                        continue;
                    }
                    if (!i18n[lang]) i18n[lang] = {};
                    if (i18n[lang][mimeType]) {
                        if (i18n[lang][mimeType] !== comment) {
                            console.warn('i18n.' + lang + '.' + mimeType + ' already exists. \n' +
                                         'Existing:  ' + i18n[lang][mimeType] + '\n' +
                                         'Ignored :  ' + comment);
                        }
                    } else {
                        i18n[lang][mimeType] = comment;
                    }
                }
            }
        }
        done();
    });
}
