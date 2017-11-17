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
const inquirer = require('inquirer');
const url = require('url');
const format = require('util').format;
const fs = require('fs');
const http = require('http');

const PARALLEL_SONGS = 1;
const DOWNLOAD_DIR = 'DOWNLOADS/';


console.log('\x1b[36m╔════════════════════════════════════════════╗\x1b[0m');
console.log('\x1b[36m║\x1b[0m              \x1b[33mDeezLoadr v1.1.0\x1b[0m              \x1b[36m║\x1b[0m');
console.log('\x1b[36m╠════════════════════════════════════════════╣\x1b[0m');
console.log('\x1b[36m║\x1b[0m     https://github.com/J05HI/DeezLoadr     \x1b[36m║\x1b[0m');
console.log('\x1b[36m║\x1b[0m          Made with love by J05HI           \x1b[36m║\x1b[0m');
console.log('\x1b[36m║\x1b[0m      Proudly released under the GPLv3      \x1b[36m║\x1b[0m');
console.log('\x1b[36m╚════════════════════════════════════════════╝\x1b[0m\n');


const musicQualities = {
    MP3_128: {
        id:   1,
        name: 'MP3 - 128 kbps'
    },
    MP3_256: {
        id:   5,
        name: 'MP3 - 256 kbps'
    },
    MP3_320: {
        id:   3,
        name: 'MP3 - 320 kbps'
    },
    FLAC:    {
        id:   9,
        name: 'FLAC - 1411 kbps'
    }
};

let selectedMusicQuality = musicQualities.MP3_320;
let downloadTaskRunning = false;


selectMusicQuality();


/**
 * Show user selection for the music download quality.
 */
function selectMusicQuality() {
    inquirer.prompt([
        {
            type:    'list',
            name:    'musicQuality',
            prefix:  '♫',
            message: 'Select music quality:',
            choices: [
                'MP3  - 128  kbps',
                'MP3  - 320  kbps',
                'FLAC - 1411 kbps'
            ],
            default: 1
        }
    ]).then(function (answers) {
        switch (answers.musicQuality) {
            case 'MP3  - 128 kbps':
                selectedMusicQuality = musicQualities.MP3_128;
                break;
            case 'MP3  - 320 kbps':
                selectedMusicQuality = musicQualities.MP3_320;
                break;
            case 'FLAC - 1411 kbps':
                selectedMusicQuality = musicQualities.FLAC;
                break;
        }
        
        askForNewDownload();
    });
}

/**
 * Ask for a album, playlist or track link to start the download.
 */
function askForNewDownload() {
    if (!downloadTaskRunning) {
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
        
        console.log('\n');
        promptly.prompt('\x1b[33mDeezer URL:\x1b[0m ', {validator: validator, retry: false}, function (err, deezerUrl) {
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
                        downloadSingleTrack(deezerUrlId);
                        break;
                }
            }
        });
    }
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
    urlQuery = urlQuery.pathname.split('/');
    
    return urlQuery[urlQuery.length - 2];
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
    urlQuery = urlQuery.pathname.split('/');
    
    return urlQuery[urlQuery.length - 1];
}

/**
 * Download multiple mp3s (album or playlist)
 *
 * @param {String} type
 * @param {Number} id
 */
function downloadMultiple(type, id) {
    let url;
    downloadTaskRunning = true;
    
    if ('album' === type) {
        url = 'http://api.deezer.com/album/';
    } else {
        url = 'http://api.deezer.com/playlist/';
    }
    
    request(format(url + '%d?limit=-1', id)).then((data) => {
        const jsonData = JSON.parse(data);
        Promise.map(jsonData.tracks.data, (track) => {
            return downloadSingleTrack(track.id);
        }, {
            concurrency: PARALLEL_SONGS
        }).then(function () {
            downloadTaskRunning = false;
        });
    });
}

/**
 * Download a track + id3tags (album cover...) and save it in the downloads folder.
 *
 * @param {Number} id
 */
function downloadSingleTrack(id) {
    let fileName;
    
    return request(format('http://www.deezer.com/track/%d', id)).then((htmlString) => {
        const PLAYER_INIT = htmlString.match(/track: ({.+}),/);
        const trackInfos = JSON.parse(PLAYER_INIT[1]).data[0];
        
        const trackQuality = getValidTrackQuality(trackInfos);
        
        console.log('\x1b[31m[DOWNLOADING]\x1b[0m ' + trackInfos.ART_NAME, '-', trackInfos.SNG_TITLE);
        
        if (trackQuality !== selectedMusicQuality) {
            let selectedMusicQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === selectedMusicQuality)].name;
            let trackQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === trackQuality)].name;
            
            console.log('              \x1b[31mThis track isn\'t available in "' + selectedMusicQualityName + '". Using "' + trackQualityName + '".\x1b[0m');
        }
        
        if (trackQuality) {
            const url = getTrackUrl(trackInfos, trackQuality.id);
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
            
            let fileExtension = 'mp3';
            
            if (musicQualities.FLAC.id === trackQuality.id) {
                fileExtension = 'flac';
            }
            
            fileName = DOWNLOAD_DIR + '/' + albumPathName + '/' + format('%s - %s', trackInfos.ART_NAME, trackInfos.SNG_TITLE).replace(/[^\w\-\s]+/g, '') + '.' + fileExtension;
            const fileStream = fs.createWriteStream(fileName);
            
            return streamTrack(trackInfos, url, bfKey, fileStream);
        } else {
            throw 'Song not available for download.';
        }
    }).then((trackInfos) => {
        addId3Tags(trackInfos, fileName);
    }).catch((err) => {
        if (404 === err.statusCode) {
            console.error('Song not found - ', err.options.uri);
        } else {
            throw err;
        }
    });
}

/**
 * Calculate the URL to download the track.
 *
 * @param {Array} trackInfos
 * @param {Number} trackQuality
 *
 * @returns {String}
 */
function getTrackUrl(trackInfos, trackQuality) {
    
    const step1 = [trackInfos.MD5_ORIGIN, trackQuality, trackInfos.SNG_ID, trackInfos.MEDIA_VERSION].join('¤');
    
    let step2 = crypto.createHash('md5').update(step1, 'ascii').digest('hex') + '¤' + step1 + '¤';
    while (step2.length % 16 > 0) step2 += ' ';
    
    const step3 = crypto.createCipheriv('aes-128-ecb', 'jo6aey6haid2Teih', '').update(step2, 'ascii', 'hex');
    const cdn = trackInfos.MD5_ORIGIN[0]; //random number between 0 and f
    
    return format('http://e-cdn-proxy-%s.deezer.com/mobile/1/%s', cdn, step3);
}

/**
 * Get a downloadable track quality.
 *
 * @param {Array} trackInfos
 *
 * @returns {Number|Boolean}
 */
function getValidTrackQuality(trackInfos) {
    if (musicQualities.FLAC === selectedMusicQuality) {
        if ('undefined' === typeof trackInfos.FILESIZE_FLAC || 0 === trackInfos.FILESIZE_FLAC) {
            if ('undefined' === typeof trackInfos.FILESIZE_MP3_320 || 0 === trackInfos.FILESIZE_MP3_320) {
                if ('undefined' === typeof trackInfos.FILESIZE_MP3_256 || 0 === trackInfos.FILESIZE_MP3_256) {
                    if ('undefined' === typeof trackInfos.FILESIZE_MP3_128 || 0 === trackInfos.FILESIZE_MP3_128) {
                        return false;
                    }
                    
                    return musicQualities.MP3_128;
                }
                
                return musicQualities.MP3_256;
            }
            
            return musicQualities.MP3_320;
        }
        
        return musicQualities.FLAC;
    }
    
    if (musicQualities.MP3_320 === selectedMusicQuality) {
        if ('undefined' === typeof trackInfos.FILESIZE_MP3_320 || 0 === trackInfos.FILESIZE_MP3_320) {
            if ('undefined' === typeof trackInfos.FILESIZE_MP3_256 || 0 === trackInfos.FILESIZE_MP3_256) {
                if ('undefined' === typeof trackInfos.FILESIZE_MP3_128 || 0 === trackInfos.FILESIZE_MP3_128) {
                    if ('undefined' === typeof trackInfos.FILESIZE_FLAC || 0 === trackInfos.FILESIZE_FLAC) {
                        return false;
                    }
                    
                    return musicQualities.FLAC;
                }
                
                return musicQualities.MP3_128;
            }
            
            return musicQualities.MP3_256;
        }
        
        return musicQualities.MP3_320;
    }
    
    if (musicQualities.MP3_128 === selectedMusicQuality) {
        if ('undefined' === typeof trackInfos.FILESIZE_MP3_128 || 0 === trackInfos.FILESIZE_MP3_128) {
            if ('undefined' === typeof trackInfos.FILESIZE_MP3_256 || 0 === trackInfos.FILESIZE_MP3_256) {
                if ('undefined' === typeof trackInfos.FILESIZE_MP3_320 || 0 === trackInfos.FILESIZE_MP3_320) {
                    if ('undefined' === typeof trackInfos.FILESIZE_FLAC || 0 === trackInfos.FILESIZE_FLAC) {
                        return false;
                    }
                    
                    return musicQualities.FLAC;
                }
                
                return musicQualities.MP3_320;
            }
            
            return musicQualities.MP3_256;
        }
        
        return musicQualities.MP3_128;
    }
    
    return false;
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
    return new Promise((resolve) => {
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
                title:         trackInfos.SNG_TITLE,
                trackNumber:   trackInfos.TRACK_NUMBER,
                partOfSet:     trackInfos.DISK_NUMBER,
                artist:        artists,
                performerInfo: trackInfos.ART_NAME,
                album:         trackInfos.ALB_TITLE,
                year:          parseInt(trackInfos.PHYSICAL_RELEASE_DATE),
                copyright:     trackInfos.COPYRIGHT,
                image:         {
                    mime:        'jpeg',
                    imageBuffer: coverBuffer
                }
            };
            
            if (!nodeID3.write(tags, filename)) {
                // Error writing tags
            }
            
            console.log('\x1b[32m[DONE]\x1b[0m        ' + trackInfos.ART_NAME, '-', trackInfos.SNG_TITLE);
            
            askForNewDownload();
        });
    } catch (ex) {
        askForNewDownload();
    }
}