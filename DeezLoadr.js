/**
 * Made with love by J05HI [https://github.com/J05HI]
 * Released under the GPLv3.
 *
 * Feel free to contribute!
 */

const chalk = require('chalk');
const ora = require('ora');
const sanitize = require('sanitize-filename');
const Promise = require('bluebird');
const request = require('request-promise');
const nodeID3 = require('node-id3');
const crypto = require('crypto');
const inquirer = require('inquirer');
const url = require('url');
const format = require('util').format;
const fs = require('fs-extra');
const http = require('http');
const https = require('https');

const DOWNLOAD_DIR = 'DOWNLOADS/';

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

const downloadSpinner = new ora({
    spinner: {
        interval: 400,
        frames:   [
            '♫',
            ' '
        ]
    },
    color:   'white'
});


/**
 * Application init.
 */
(function initApp() {
    // Prevent closing the application instantly
    process.stdin.resume();
    
    /**
     * The handler which will be executed before closing the application.
     */
    function exitHandler() {
        fs.removeSync(DOWNLOAD_DIR + 'tempAlbumCovers');
        
        process.exit();
    }
    
    // Do something when app is closing
    process.on('exit', exitHandler.bind(null, {}));
    
    // Catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {}));
    
    // Catches "kill pid"
    process.on('SIGUSR1', exitHandler.bind(null, {}));
    process.on('SIGUSR2', exitHandler.bind(null, {}));
    
    // Catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {}));
    
    
    // App info
    console.log(chalk.cyan('╔════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.yellow('              DeezLoadr v1.2.0              ') + chalk.cyan('║'));
    console.log(chalk.cyan('╠════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + '          Made with love by J05HI           ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '      Proudly released under the GPLv3      ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '     https://github.com/J05HI/DeezLoadr     ' + chalk.cyan('║'));
    console.log(chalk.cyan('╠════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + chalk.redBright(' ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ DONATE ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ♥ ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '      PayPal:  https://paypal.me/J05HI      ' + chalk.cyan('║'));
    console.log(chalk.cyan('║') + '  BTC:  18JFjbdSDNQF69LNCJh8mhfoqRBTJuobCi  ' + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════╝\n'));
    
    selectMusicQuality();
})();

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
            case 'MP3  - 128  kbps':
                selectedMusicQuality = musicQualities.MP3_128;
                break;
            case 'MP3  - 320  kbps':
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
        console.log('\n');
        
        let questions = [
            {
                type:     'input',
                name:     'deezerUrl',
                prefix:   '♫',
                message:  'Deezer URL:',
                validate: function (deezerUrl) {
                    if (deezerUrl) {
                        let deezerUrlType = getDeezerUrlTye(deezerUrl);
                        let allowedDeezerUrlTypes = [
                            'album',
                            'playlist',
                            'track'
                        ];
                        
                        if (allowedDeezerUrlTypes.includes(deezerUrlType)) {
                            return true;
                        }
                    }
                    
                    return 'Deezer URL example: http://www.deezer.com/album|playlist|track/0123456789';
                }
            }
        ];
        
        inquirer.prompt(questions).then(answers => {
            console.log('');
            
            let deezerUrlType = getDeezerUrlTye(answers.deezerUrl);
            let deezerUrlId = getDeezerUrlId(answers.deezerUrl);
            
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
 * @return {Number}
 */
function getDeezerUrlId(deezerUrl) {
    let urlQuery = url.parse(deezerUrl, true);
    urlQuery = urlQuery.pathname.split('/');
    
    let lastUrlPiece = urlQuery[urlQuery.length - 1];
    lastUrlPiece = lastUrlPiece.split('?');
    
    return parseInt(lastUrlPiece[0]);
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
            concurrency: 1
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
        
        if (trackInfos.VERSION) {
            trackInfos.SNG_TITLE += ' ' + trackInfos.VERSION;
        }
        
        downloadSpinner.text = 'Downloading "' + trackInfos.ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"';
        downloadSpinner.start();
        
        if (trackQuality !== selectedMusicQuality) {
            let selectedMusicQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === selectedMusicQuality)].name;
            let trackQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === trackQuality)].name;
            
            console.log(chalk.red('              This track isn\'t available in "' + selectedMusicQualityName + '". Using "' + trackQualityName + '".'));
        }
        
        if (trackQuality) {
            const url = getTrackUrl(trackInfos, trackQuality.id);
            
            let artistName = multipleWhitespacesToSingle(sanitize(trackInfos.ART_NAME));
            
            if ('' === artistName.trim()) {
                artistName = 'Unknown artist';
            }
            
            let albumName = multipleWhitespacesToSingle(sanitize(trackInfos.ALB_TITLE));
            
            if ('' === albumName.trim()) {
                albumName = 'Unknown album';
            }
            
            // todo: Improve download dir creation
            if (!fs.existsSync(DOWNLOAD_DIR)) {
                fs.mkdirSync(DOWNLOAD_DIR);
            }
            
            if (!fs.existsSync(DOWNLOAD_DIR + '/' + artistName)) {
                fs.mkdirSync(DOWNLOAD_DIR + '/' + artistName);
            }
            
            if (!fs.existsSync(DOWNLOAD_DIR + '/' + artistName + '/' + albumName)) {
                fs.mkdirSync(DOWNLOAD_DIR + '/' + artistName + '/' + albumName);
            }
            
            let fileExtension = 'mp3';
            
            if (musicQualities.FLAC.id === trackQuality.id) {
                fileExtension = 'flac';
            }
            
            fileName = DOWNLOAD_DIR + '/' + artistName + '/' + albumName + '/' + multipleWhitespacesToSingle(sanitize(toTwoDigits(trackInfos.TRACK_NUMBER) + ' ' + trackInfos.SNG_TITLE)) + '.' + fileExtension;
            const fileStream = fs.createWriteStream(fileName);
            
            return streamTrack(trackInfos, url, fileStream);
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
 * Adds a zero to the beginning if the number has only one digit.
 *
 * @param {String} number
 * @returns {String}
 */
function toTwoDigits(number) {
    return (number < 10 ? '0' : '') + number;
}

/**
 * Replaces multiple whitespaces with a single one.
 *
 * @param {String} string
 * @returns {String}
 */
function multipleWhitespacesToSingle(string) {
    return string.replace(/[ _,]+/g, ' ');
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
    const cdn = generateRandomHexString(1);
    
    return 'http://e-cdn-proxy-' + cdn + '.deezer.com/mobile/1/' + step3;
}

/**
 * Generate a string with hex characters only.
 *
 * @param {Number} stringLength
 *
 * @returns {string}
 */
function generateRandomHexString(stringLength) {
    let randomString = '';
    let possible = '0123456789abcdef';
    
    for (let i = 0; i < stringLength; i++) {
        randomString += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    
    return randomString;
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
 * @param stream
 */
function streamTrack(trackInfos, url, stream) {
    return new Promise((resolve) => {
        http.get(url, function (response) {
            let i = 0;
            let percent = 0;
            response.on('readable', () => {
                const bfKey = getBlowfishKey(trackInfos);
                
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
    // todo: OLD URL! (remove it if the new one is 100% working)
    // const albumCoverUrl = 'http://e-cdn-images.deezer.com/images/cover/' + trackInfos.ALB_PICTURE + '/500x500.jpg';
    
    const albumCoverUrl = 'https://e-cdns-images.dzcdn.net/images/cover/' + trackInfos.ALB_PICTURE + '/500x500.jpg';
    
    try {
        if (!fs.existsSync(DOWNLOAD_DIR + '/tempAlbumCovers')) {
            fs.mkdirSync(DOWNLOAD_DIR + '/tempAlbumCovers');
        }
        
        let albumCoverPath = DOWNLOAD_DIR + 'tempAlbumCovers/' + multipleWhitespacesToSingle(sanitize(trackInfos.SNG_TITLE)) + '.jpg';
        let albumCoverFile = fs.createWriteStream(albumCoverPath);
        
        https.get(albumCoverUrl, function (albumCoverBuffer) {
            let metadata = {
                title:              trackInfos.SNG_TITLE,
                artist:             trackInfos.ART_NAME,
                album:              trackInfos.ALB_TITLE,
                copyright:          trackInfos.COPYRIGHT,
                performerInfo:      trackInfos.ART_NAME,
                trackNumber:        trackInfos.TRACK_NUMBER,
                partOfSet:          trackInfos.DISK_NUMBER,
                ISRC:               trackInfos.ISRC,
                encodingTechnology: 'DeezLoadr',
                comment:            {
                    text: 'Downloaded from Deezer with DeezLoadr. https://github.com/J05HI/DeezLoadr'
                }
            };
            
            if (trackInfos.PHYSICAL_RELEASE_DATE) {
                metadata.year = trackInfos.PHYSICAL_RELEASE_DATE.slice(0, 4);
            }
            
            metadata.artist = '';
            let first = true;
            trackInfos.ARTISTS.forEach(function (trackArtist) {
                if (first) {
                    metadata.artist = trackArtist.ART_NAME;
                    first = false;
                } else {
                    metadata.artist += ', ' + trackArtist.ART_NAME;
                }
            });
            
            if (trackInfos.SNG_CONTRIBUTORS) {
                if (trackInfos.SNG_CONTRIBUTORS.composer) {
                    metadata.composer = trackInfos.SNG_CONTRIBUTORS.composer.join(', ');
                }
                if (trackInfos.SNG_CONTRIBUTORS.musicpublisher) {
                    metadata.publisher = trackInfos.SNG_CONTRIBUTORS.musicpublisher.join(', ');
                }
            }
            
            albumCoverBuffer.pipe(albumCoverFile);
            
            if (!albumCoverBuffer) {
                metadata.image = undefined;
                return;
            }
            
            metadata.image = (albumCoverPath).replace(/\\/g, '/');
            
            setTimeout(function () {
                if (!nodeID3.write(metadata, filename)) {
                    downloadSpinner.warn('Failed writing ID3 tags to "' + trackInfos.ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"');
                } else {
                    downloadSpinner.succeed('Downloaded "' + trackInfos.ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"');
                }
                
                askForNewDownload();
            }, 50);
        });
    } catch (ex) {
        downloadSpinner.warn('Failed writing ID3 tags to "' + trackInfos.ART_NAME + ' - ' + trackInfos.SNG_TITLE + '"');
        
        askForNewDownload();
    }
}