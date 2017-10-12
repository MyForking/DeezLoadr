/**
 * Made with love by J05HI [https://github.com/J05HI]
 * Released under the GPLv3.
 *
 * Feel free to contribute!
 */

const promptly = require('promptly');
const Promise = require('bluebird');
const request = require('request-promise');
const nodeID3 = require('node-id3');
const crypto = require('crypto');
const url = require('url');
const format = require('util').format;
const fs = require('fs');
const http = require('http');

const PARALLEL_SONGS = 1;
const DOWNLOAD_DIR = 'DOWNLOADS/';


askForNewDownload();

/**
 * Ask for a album, playlist or track link to start the download.
 */
function askForNewDownload() {
    let validator = function (deezerUrl) {
        let deezerUrlType = getDeezerUrlTye(deezerUrl);
        let allowedDeezerUrlTypes = [
            'album',
            'playlist',
            'track'
        ];
        
        
        if (!allowedDeezerUrlTypes.includes(deezerUrlType)) {
            throw new Error('Deezer URL example: http://www.deezer.com/album|playlist|track/0123456789');
        }
        
        return deezerUrl;
    };
    
    promptly.prompt('Deezer URL: ', {validator: validator, retry: false}, function (err, deezerUrl) {
        if (err) {
            console.error(err.message);
            
            return err.retry();
        } else {
            let deezerUrlType = getDeezerUrlTye(deezerUrl);
            let deezerUrlId = getDeezerUrlId(deezerUrl);
            
            switch (deezerUrlType) {
                case 'album':
                    downloadMultiple('album', deezerUrlId);
                    break;
                case 'playlist':
                    downloadMultiple('playlist', deezerUrlId);
                    break;
                case 'track':
                    download(deezerUrlId);
                    break;
            }
        }
    });
}

/**
 * Get the deezer url type (album, playlist, track) from the deezer url.
 *
 * @param {String} deezerUrl
 *
 * @return {String}
 */
function getDeezerUrlTye(deezerUrl) {
    let urlQuery = url.parse(deezerUrl, true);
    
    return urlQuery.pathname.split('/')[1];
}

/**
 * Get the deezer url id from the deezer url.
 *
 * @param {String} deezerUrl
 *
 * @return {String}
 */
function getDeezerUrlId(deezerUrl) {
    let urlQuery = url.parse(deezerUrl, true);
    
    return urlQuery.pathname.split('/')[2];
}

/**
 * Download multiple mp3s (album or playlist)
 *
 * @param {String} type
 * @param {Number} id
 */
function downloadMultiple(type, id) {
    let url;
    if ('album' === type) {
        url = 'http://api.deezer.com/album/';
    } else {
        url = 'http://api.deezer.com/playlist/';
    }
    request(format(url + '%d?limit=-1', id)).then((data) => {
        const jsonData = JSON.parse(data);
        Promise.map(jsonData.tracks.data, (track) => {
            return download(track.id);
        }, {
            concurrency: PARALLEL_SONGS
        }).then(function () {
        });
    });
}

/**
 * Download a track + id3tags (album cover...) and save it in the downloads folder.
 *
 * @param {Number} id
 */
function download(id) {
    return request(format('http://www.deezer.com/track/%d', id)).then((htmlString) => {
        const PLAYER_INIT = htmlString.match(/track: ({.+}),/);
        const trackInfos = JSON.parse(PLAYER_INIT[1]).data[0];
        
        const url = getTrackUrl(trackInfos);
        const bfKey = getBlowfishKey(trackInfos);
        
        let albumPathName = trackInfos.ALB_TITLE.replace(/[^\w\-\s]+/g, '').replace(/\s+/g, ' ');
        
        if ('' === albumPathName.trim()) {
            albumPathName = 'Unknown album';
        }
        
        // todo: Improve download dir creation
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR);
        }
        
        if (!fs.existsSync(DOWNLOAD_DIR + '/' + albumPathName)) {
            fs.mkdirSync(DOWNLOAD_DIR + '/' + albumPathName);
        }
        
        if (!fs.existsSync(DOWNLOAD_DIR + '/' + albumPathName)) {
            fs.mkdirSync(DOWNLOAD_DIR + '/' + albumPathName);
        }
        
        const fileName = DOWNLOAD_DIR + '/' + albumPathName + '/' + format('%s - %s', trackInfos.ART_NAME, trackInfos.SNG_TITLE).replace(/[^\w\-\s]+/g, '') + '.mp3'; //Illegal characters
        
        console.log('"' + trackInfos.ART_NAME, '-', trackInfos.SNG_TITLE + '"  \x1b[31m[DOWNLOADING]\x1b[0m');
        const fileStream = fs.createWriteStream(fileName);
        return streamTrack(trackInfos, url, bfKey, fileStream);
    }).then((trackInfos) => {
        let albumPathName = trackInfos.ALB_TITLE.replace(/[^\w\-\s]+/g, '').replace(/\s+/g, ' ');
        
        if ('' === albumPathName.trim()) {
            albumPathName = 'Unknown album';
        }
        
        const fileName = DOWNLOAD_DIR + '/' + albumPathName + '/' + format('%s - %s', trackInfos.ART_NAME, trackInfos.SNG_TITLE).replace(/[^\w\-\s]+/g, '') + '.mp3'; //Illegal characters
        
        addId3Tags(trackInfos, fileName);
    }).catch((err) => {
        if (404 === err.statusCode) {
            console.error('Song not found -', err.options.uri);
        } else {
            throw err;
        }
    });
}

/**
 * Calculate the URL to download the track.
 *
 * @param {Array} trackInfos
 */
function getTrackUrl(trackInfos) {
    const fileFormat = (trackInfos.FILESIZE_MP3_320) ? 3 : (trackInfos.FILESIZE_MP3_256) ? 5 : 1;
    
    const step1 = [trackInfos.MD5_ORIGIN, fileFormat, trackInfos.SNG_ID, trackInfos.MEDIA_VERSION].join('¤');
    
    let step2 = crypto.createHash('md5').update(step1, 'ascii').digest('hex') + '¤' + step1 + '¤';
    while (step2.length % 16 > 0) step2 += ' ';
    
    const step3 = crypto.createCipheriv('aes-128-ecb', 'jo6aey6haid2Teih', '').update(step2, 'ascii', 'hex');
    const cdn = trackInfos.MD5_ORIGIN[0]; //random number between 0 and f
    
    return format('http://e-cdn-proxy-%s.deezer.com/mobile/1/%s', cdn, step3);
}

/**
 * calculate the blowfish key to decrypt the track
 *
 * @param {Array} trackInfos
 */
function getBlowfishKey(trackInfos) {
    const SECRET = 'g4el58wc0zvf9na1';
    
    const idMd5 = crypto.createHash('md5').update(trackInfos.SNG_ID, 'ascii').digest('hex');
    let bfKey = '';
    
    for (let i = 0; i < 16; i++) {
        bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
    }
    
    return bfKey;
}

/**
 * Download the track, decrypt it and write it in a stream
 *
 * @param {Array} trackInfos
 * @param {String} url
 * @param {String} bfKey
 * @param stream
 */
function streamTrack(trackInfos, url, bfKey, stream) {
    return new Promise((resolve, reject) => {
        http.get(url, function (response) {
            let i = 0;
            let percent = 0;
            response.on('readable', () => {
                let chunk;
                while (chunk = response.read(2048)) {
                    if (100 * 2048 * i / response.headers['content-length'] >= percent + 1) {
                        percent++;
                    }
                    if (i % 3 > 0 || chunk.length < 2048) {
                        stream.write(chunk);
                    } else {
                        const bfDecrypt = crypto.createDecipheriv('bf-cbc', bfKey, '\x00\x01\x02\x03\x04\x05\x06\x07');
                        bfDecrypt.setAutoPadding(false);
                        
                        let chunkDec = bfDecrypt.update(chunk.toString('hex'), 'hex', 'hex');
                        chunkDec += bfDecrypt.final('hex');
                        stream.write(chunkDec, 'hex');
                    }
                    i++;
                }
            });
            response.on('end', () => {
                stream.end();
                resolve(trackInfos);
            });
        });
    });
}

/**
 * Add ID3Tag to the mp3 file.
 *
 * @param {Array} trackInfos
 * @param {String} filename
 */
function addId3Tags(trackInfos, filename) {
    const coverUrl = format('http://e-cdn-images.deezer.com/images/cover/%s/500x500.jpg', trackInfos.ALB_PICTURE);
    
    try {
        return request({url: coverUrl, encoding: null}).then((coverBuffer) => {
            let artists;
            
            if (trackInfos.SNG_CONTRIBUTORS.featuring) {
                artists = trackInfos.SNG_CONTRIBUTORS.featuring;
            } else if (trackInfos.SNG_CONTRIBUTORS.mainartist) {
                artists = trackInfos.SNG_CONTRIBUTORS.mainartist;
            } else {
                artists = [trackInfos.ART_NAME];
            }
            
            let tags = {
                title: trackInfos.SNG_TITLE,
                trackNumber: trackInfos.TRACK_NUMBER,
                partOfSet: trackInfos.DISK_NUMBER,
                artist: artists,
                performerInfo: trackInfos.ART_NAME,
                album: trackInfos.ALB_TITLE,
                year: parseInt(trackInfos.PHYSICAL_RELEASE_DATE),
                copyright: trackInfos.COPYRIGHT,
                image: {
                    mime: 'jpeg',
                    imageBuffer: coverBuffer
                }
            };
            
            if (!nodeID3.write(tags, filename)) {
                // Error writing tags
            }
            
            console.log('"' + trackInfos.ART_NAME, '-', trackInfos.SNG_TITLE + '"  \x1b[32m[DONE]\x1b[0m');
        });
    } catch (ex) {
    }
}