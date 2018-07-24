const prism = require('prism-media');
const ytdl = require('ytdl-core');
const rethink = require('rethinkdbdash')();
const { createWriteStream } = require('fs');

(async () => await rethink.connect())();

const downloading = [];

process.on('message', message => {
	console.log(message);
	if (message.command === 'download' && !message.noReturn) {
		const currentlyDownloading = downloading.includes(message.id);
		if (!currentlyDownloading) downloading.push(message.id);

		const ffmpeg = new prism.FFmpeg({
			args: [
				'-analyzeduration', '0',
				'-loglevel', '0',
				'-f', 's16le',
				'-ar', '48000',
				'-ac', '2'
			]
		});

		const encoder = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });

		const muxer = new prism.OggOpusMuxer();

		const vid = ytdl(message.url, { quality: 'highestaudio' });

		const pipe = createWriteStream(null, { fd: message.pipe, autoClose: true });

		vid.pipe(ffmpeg).pipe(encoder).pipe(muxer).pipe(pipe);

		const chunks = [];

		if (currentlyDownloading) console.log('Downloading, but not writing.');
		else console.log('Downloading and writing.');

		if (!currentlyDownloading) {
			muxer.on('data', chunk => {
				chunks.push(chunk);
			});
		}

		muxer.on('end', async () => {
			downloading.splice(downloading.indexOf(message.id));
			console.log('Downloading done.');
			if (!currentlyDownloading) {
				await rethink.table('audio').insert({
					id: message.id,
					files: chunks
				});
				console.log('Data written.');
			}

			pipe.emit('end');

			process.send({ done: true, id: message.id, pipeIndex: message.pipe });
		});
	} else {
		if (downloading.includes(message.id)) return;

		const _chunks = [];

		const vid = ytdl(message.url, { quality: 'highestaudio' });

		const ffmpeg = new prism.FFmpeg({
			args: [
				'-analyzeduration', '0',
				'-loglevel', '0',
				'-f', 's16le',
				'-ar', '48000',
				'-ac', '2'
			]
		});

		const encoder = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });

		const muxer = new prism.OggOpusMuxer();

		vid.pipe(ffmpeg).pipe(encoder).pipe(muxer);

		muxer.on('data', chunk => {
			_chunks.push(chunk);
		});

		muxer.on('end', async () => {
			await rethink.table('audio').insert({
				id: message.id,
				files: _chunks
			});
			process.send({ done: true, id: message.id, pipeIndex: message.pipe });
		});
	}
});
