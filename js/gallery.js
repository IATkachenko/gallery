/* global OC, $, _, t, Album, GalleryImage, SlideShow, oc_requesttoken, marked */
var Gallery = {};
Gallery.mediaTypes = {};
Gallery.images = [];
Gallery.currentAlbum = null;
Gallery.users = [];
Gallery.albumsInfo = {};
Gallery.albumMap = {};
Gallery.imageMap = {};
Gallery.appName = 'galleryplus';
Gallery.token = undefined;
Gallery.currentSort = {};

/**
 * Returns a list of supported media types
 * 
 * @returns {string}
 */
Gallery.getMediaTypes = function () {
	var types = '';
	for (var i = 0, keys = Object.keys(Gallery.mediaTypes); i < keys.length; i++) {
		types += keys[i] + ';';
	}

	return types.slice(0, -1);
};

/**
 * Builds a map of the albums located in the current folder
 *
 * @param {string} path
 *
 * @returns {Album}
 */
Gallery.getAlbum = function (path) {
	if (!Gallery.albumMap[path]) {
		Gallery.albumMap[path] = new Album(path, [], [], OC.basename(path));
		// Attaches sub-albums to the current one
		if (path !== '') {
			var parent = OC.dirname(path);
			if (parent === path) {
				parent = '';
			}
			Gallery.getAlbum(parent).subAlbums.push(Gallery.albumMap[path]);
		}
	}
	return Gallery.albumMap[path];
};

/**
 * Refreshes the view and starts the slideshow if required
 *
 * @param {string} path
 * @param {string} albumPath
 */
Gallery.refresh = function (path, albumPath) {
	if (Gallery.currentAlbum !== albumPath) {
		Gallery.view.init(albumPath);
	}

	// If the path is mapped, that means that it's an albumPath
	if (Gallery.albumMap[path]) {
		if (Gallery.activeSlideShow) {
			Gallery.activeSlideShow.stop();
		}
	} else if (Gallery.imageMap[path] && !Gallery.activeSlideShow) {
		Gallery.view.startSlideshow(path, albumPath);
	}
};

/**
 * Retrieves information about all the images and albums located in the current folder
 *
 * @returns {*}
 */
Gallery.getFiles = function () {
	var album, image;
	Gallery.images = [];
	Gallery.albumMap = {};
	Gallery.imageMap = {};
	var currentLocation = window.location.href.split('#')[1] || '';
	var params = {
		location: currentLocation,
		mediatypes: Gallery.getMediaTypes()
	};
	// Only use the folder as a GET parameter and not as part of the URL
	var url = Gallery.buildUrl('files', '', params);
	return $.getJSON(url).then(function (data) {
		var path = null;
		var fileId = null;
		var mimeType = null;
		var mTime = null;
		var files = data.files;
		var albumInfo = data.albuminfo;
		Gallery.albumsInfo[albumInfo.path] = {
			fileid: albumInfo.fileid,
			permissions: albumInfo.permissions,
			description: albumInfo.description,
			copyright: albumInfo.copyright,
			copyrightLink: albumInfo.copyright_link
		};
		for (var i = 0; i < files.length; i++) {
			path = files[i].path;
			fileId = files[i].fileid;
			mimeType = files[i].mimetype;
			mTime = files[i].mtime;

			Gallery.images.push(path);

			image = new GalleryImage(path, path, fileId, mimeType, mTime);
			var dir = OC.dirname(path);
			if (dir === path) {
				dir = '';
			}
			album = Gallery.getAlbum(dir);
			album.images.push(image);
			Gallery.imageMap[image.path] = image;
		}
		var sortType = 'name';
		var sortOrder = 'asc';
		var albumSortOrder = 'asc';
		if (!$.isEmptyObject(albumInfo.sorting)) {
			sortType = albumInfo.sorting;
		}
		if (!$.isEmptyObject(albumInfo.sort_order)) {
			sortOrder = albumInfo.sort_order;
			if (sortType === 'name') {
				albumSortOrder = sortOrder;
			}
		}

		Gallery.currentSort = {
			type: sortType,
			order: sortOrder
		};

		for (var j = 0, keys = Object.keys(Gallery.albumMap); j < keys.length; j++) {
			Gallery.albumMap[keys[j]].images.sort(Gallery.sortBy(sortType, sortOrder));
			Gallery.albumMap[keys[j]].subAlbums.sort(Gallery.sortBy('name', albumSortOrder));
		}
	}, function () {
		// Triggered if we couldn't find a working folder
		Gallery.view.element.empty();
		Gallery.showEmpty();
		Gallery.currentAlbum = null;
	});
};

/**
 * Sorts images and albums arrays
 *
 * @param {string} sortType
 * @param {string} sortOrder
 *
 * @returns {Function}
 */
Gallery.sortBy = function (sortType, sortOrder) {
	if (sortType === 'name') {
		if (sortOrder === 'asc') {
			//sortByNameAsc
			return function (a, b) {
				return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
			};
		}
		//sortByNameDes
		return function (a, b) {
			return b.path.toLowerCase().localeCompare(a.path.toLowerCase());
		};
	}
	if (sortType === 'date') {
		if (sortOrder === 'asc') {
			//sortByDateAsc
			return function (a, b) {
				return b.mTime - a.mTime;
			};
		}
		//sortByDateDes
		return function (a, b) {
			return a.mTime - b.mTime;
		};
	}
};

/**
 * Builds the URL which will retrieve a large preview of the file
 *
 * @param {string} image
 *
 * @return {string}
 */
Gallery.getPreviewUrl = function (image) {
	var width = $(window).width() * window.devicePixelRatio;
	var height = $(window).height() * window.devicePixelRatio;
	var params = {
		file: image,
		x: width,
		y: height,
		requesttoken: oc_requesttoken
	};
	return Gallery.buildUrl('preview', '', params);
};

/**
 * Populates the share dialog with the needed information
 *
 * @param event
 */
Gallery.share = function (event) {
	// Clicking on share button does not trigger automatic slide-up
	$('.album-info-content').slideUp();

	if (!OC.Share.droppedDown) {
		event.preventDefault();
		event.stopPropagation();

		(function () {
			var target = OC.Share.showLink;
			OC.Share.showLink = function () {
				var r = target.apply(this, arguments);
				$('#linkText').val($('#linkText').val().replace('index.php/s/', 'index.php/apps/' +
				Gallery.appName + '/s/'));

				return r;
			};
		})();

		var albumInfo = Gallery.albumsInfo[Gallery.currentAlbum];
		$('a.share').data('item', albumInfo.fileid).data('link', true)
			.data('possible-permissions', albumInfo.permissions).
			click();
		if (!$('#linkCheckbox').is(':checked')) {
			$('#linkText').hide();
		}
	}
};

/**
 * Builds a URL pointing to one of our PHP controllers
 *
 * @param {string} endPoint
 * @param {undefined|string} path
 * @param params
 *
 * @returns {string}
 */
Gallery.buildUrl = function (endPoint, path, params) {
	if (path === undefined) {
		path = '';
	}
	var extension = '';
	if (Gallery.token) {
		params.token = Gallery.token;
		extension = '.public';
	}
	var query = OC.buildQueryString(params);
	return OC.generateUrl('apps/' + Gallery.appName + '/' + endPoint + extension + path, null) +
		'?' +
		query;
};

/**
 * Sends an archive of the current folder to the browser
 *
 * @param event
 */
Gallery.download = function (event) {
	event.preventDefault();
	OC.redirect(OC.generateUrl('s/{token}/download?path={path}&files={files}', {
		token: Gallery.token,
		path: $('#content').data('albumname'),
		files: Gallery.currentAlbum
	}));
};

/**
 * Shows an information box to the user
 *
 * @param event
 */
Gallery.showInfo = function (event) {
	event.stopPropagation();
	var infoContentElement = $('.album-info-content');
	var adjustHeight = function () {
		infoContentElement.removeClass('icon-loading');
		var newHeight = infoContentElement[0].scrollHeight;
		infoContentElement.animate({
			height: newHeight + 40
		}, 500);
		infoContentElement.scrollTop(0);
	};

	if (infoContentElement.is(':visible')) {
		infoContentElement.slideUp();
	} else {
		var albumInfo = Gallery.albumsInfo[Gallery.currentAlbum];
		if (!albumInfo.infoLoaded) {
			infoContentElement.addClass('icon-loading');
			infoContentElement.empty();
			infoContentElement.height(100);
			infoContentElement.slideDown();
			if (!$.isEmptyObject(albumInfo.description)) {
				var params = {
					file: Gallery.currentAlbum + '/' + albumInfo.description
				};
				var descriptionUrl = Gallery.buildUrl('download', '', params);
				$.get(descriptionUrl).done(function (data) {
						infoContentElement.append(marked(data));
						infoContentElement.find('a').attr("target", "_blank");
						Gallery.showCopyright(albumInfo, infoContentElement);
						adjustHeight();
					}
				).fail(function () {
						infoContentElement.append('<p>' +
						t('gallery', 'Could not load the description') + '</p>');
						Gallery.showCopyright(albumInfo, infoContentElement);
						adjustHeight();
					});
			} else {
				Gallery.showCopyright(albumInfo, infoContentElement);
				adjustHeight();
			}
			albumInfo.infoLoaded = true;
		} else {
			infoContentElement.slideDown();
		}
		infoContentElement.scrollTop(0);
	}
};

/**
 * Adds copyright information to the information box
 *
 * @param albumInfo
 * @param infoContentElement
 */
Gallery.showCopyright = function (albumInfo, infoContentElement) {
	if (!$.isEmptyObject(albumInfo.copyright) || !$.isEmptyObject(albumInfo.copyrightLink)) {
		var copyright;
		var copyrightTitle = $('<h4/>');
		copyrightTitle.append(t('gallery', 'Copyright'));
		infoContentElement.append(copyrightTitle);

		if (!$.isEmptyObject(albumInfo.copyright)) {
			copyright = marked(albumInfo.copyright);
		} else {
			copyright = '<p>' + t('gallery', 'Copyright notice') + '</p>';
		}

		if (!$.isEmptyObject(albumInfo.copyrightLink)) {
			var subUrl = '';
			var params = {
				path: '/' + Gallery.currentAlbum,
				files: albumInfo.copyrightLink
			};
			if (Gallery.token) {
				params.token = Gallery.token;
				subUrl = 's/{token}/download?dir={path}&files={files}';
			} else {
				subUrl = 'apps/files/ajax/download.php?dir={path}&files={files}';
			}
			var copyrightUrl = OC.generateUrl(subUrl, params);
			var copyrightLink = $('<a>', {
				html: copyright,
				title: copyright,
				href: copyrightUrl,
				target: "_blank"
			});
			infoContentElement.append(copyrightLink);
		} else {
			infoContentElement.append(copyright);
		}
	}
};

/**
 * Hide the search button while we wait for core to fix the templates
 */
Gallery.hideSearch = function () {
	$('form.searchbox').hide();
};

/**
 * Shows an empty gallery message
 */
Gallery.showEmpty = function () {
	$('#emptycontent').removeClass('hidden');
	$('#controls').addClass('hidden');
	$('#content').removeClass('icon-loading');
};

/**
 * Shows the infamous loading spinner
 */
Gallery.showLoading = function () {
	$('#emptycontent').addClass('hidden');
	$('#controls').removeClass('hidden');
	$('#content').addClass('icon-loading');
};

/**
 * Shows thumbnails
 */
Gallery.showNormal = function () {
	$('#emptycontent').addClass('hidden');
	$('#controls').removeClass('hidden');
	$('#content').removeClass('icon-loading');
};

/**
 * Shows a warning to users of old, unsupported version of Internet Explorer
 */
Gallery.showOldIeWarning = function () {
	var text = '<strong>Your browser is not supported!</strong></br>' +
		'please install one of the following alternatives</br>' +
		'<a href="http://www.getfirefox.com"><strong>Mozilla Firefox</strong></a> or ' +
		'<a href="https://www.google.com/chrome/"><strong>Google Chrome</strong></a>' +
		'</br>';
	Gallery.showHtmlNotification(text, 60);
};

/**
 * Shows a warning to users of the latest version of Internet Explorer
 */
Gallery.showModernIeWarning = function () {
	var text = '<strong>This application may not work properly on your browser.</strong></br>' +
		'For an improved experience, please install one of the following alternatives</br>' +
		'<a href="http://www.getfirefox.com"><strong>Mozilla Firefox</strong></a> or ' +
		'<a href="https://www.google.com/chrome/"><strong>Google Chrome</strong></a>' +
		'</br>';
	Gallery.showHtmlNotification(text, 15);
};

/**
 * Shows a notification at the top of the screen
 *
 * @param {string} text
 * @param {int} timeout
 */
Gallery.showHtmlNotification = function (text, timeout) {
	var options = {
		timeout: timeout,
		isHTML: true
	};
	OC.Notification.showTemporary(t('gallery', text), options);
};

/**
 * Creates a new slideshow using the images found in the current folder
 *
 * @param {array} images
 * @param {string} startImage
 * @param {bool} autoPlay
 *
 * @returns {boolean}
 */
Gallery.slideShow = function (images, startImage, autoPlay) {
	if (startImage === undefined) {
		OC.Notification.showTemporary(t('gallery', 'Aborting preview. Could not find the file'));
		return false;
	}
	var start = images.indexOf(startImage);
	images = images.map(function (image) {
		var name = OC.basename(image.path);
		var previewUrl = Gallery.getPreviewUrl(image.src);
		var params = {
			file: image.src,
			requesttoken: oc_requesttoken
		};
		var downloadUrl = Gallery.buildUrl('download', '', params);

		return {
			name: name,
			path: image.path,
			mimeType: image.mimeType,
			url: previewUrl,
			downloadUrl: downloadUrl
		};
	});

	var slideShow = new SlideShow($('#slideshow'), images);
	slideShow.onStop = function () {
		Gallery.activeSlideShow = null;
		$('#content').show();
		location.hash = encodeURIComponent(Gallery.currentAlbum);
	};
	Gallery.activeSlideShow = slideShow;

	slideShow.init(autoPlay);
	slideShow.show(start);
};

Gallery.activeSlideShow = null;

$(document).ready(function () {
	Gallery.hideSearch();

	Gallery.ie11AndAbove =
		navigator.userAgent.indexOf('Trident') != -1 && navigator.userAgent.indexOf('MSIE') == -1;
	Gallery.ie10AndBelow = navigator.userAgent.indexOf('MSIE') != -1;

	if (Gallery.ie10AndBelow) {
		Gallery.showOldIeWarning();
		Gallery.showEmpty();
	} else {
		if (Gallery.ie11AndAbove) {
			Gallery.showModernIeWarning();
		}

		// Needed to centre the spinner in some browsers
		$('#content').height($(window).height());
		Gallery.showLoading();

		Gallery.view.element = $('#gallery');
		if (Gallery.view.element.data('token')) {
			Gallery.token = Gallery.view.element.data('token');
		}

		if (Gallery.view.element.data('requesttoken')) {
			oc_requesttoken = Gallery.view.element.data('requesttoken');
		}

		$.getJSON(Gallery.buildUrl('mediatypes', '', {}))
			.then(function (mediaTypes) {
				//console.log('mediaTypes', mediaTypes);
				Gallery.mediaTypes = mediaTypes;
			})
			.then(function () {
				Gallery.getFiles().then(function () {
					window.onhashchange();
				});
			});

		$('#openAsFileListButton').click(function () {
			var subUrl = '';
			var params = {path: '/' + encodeURIComponent(Gallery.currentAlbum)};
			if (Gallery.token) {
				params.token = Gallery.token;
				subUrl = 's/{token}?path={path}';
			} else {
				subUrl = 'apps/files?dir={path}';
			}
			OC.redirect(OC.generateUrl(subUrl, params));
		});

		$(document).click(function () {
			$('.album-info-content').slideUp();
		});

		$(window).scroll(function () {
			Gallery.view.loadVisibleRows(Gallery.albumMap[Gallery.currentAlbum], Gallery.currentAlbum);
		});
		$('#content-wrapper').scroll(function () {
			Gallery.view.loadVisibleRows(Gallery.albumMap[Gallery.currentAlbum], Gallery.currentAlbum);
		});

		// A shorter delay avoids redrawing the view in the middle of a previous request, but it
		// may kill baby CPUs
		$(window).resize(_.throttle(function () {
			Gallery.view.viewAlbum(Gallery.currentAlbum);
			var infoContentElement = $('.album-info-content');
			infoContentElement.css('max-height', $(window).height() - 150);
		}, 500));
	}
});

window.onhashchange = function () {
	// The hash location is ALWAYS encoded
	var path = decodeURIComponent(window.location.href.split('#')[1] || '');
	var albumPath = OC.dirname(path);
	if (Gallery.albumMap[path]) {
		albumPath = path;
	} else if (!Gallery.albumMap[albumPath]) {
		albumPath = '';
	}
	if (Gallery.currentAlbum !== null && Gallery.currentAlbum !== albumPath) {
		Gallery.getFiles().done(function () {
			Gallery.refresh(path, albumPath);
		});
	} else {
		Gallery.refresh(path, albumPath);
	}
};
