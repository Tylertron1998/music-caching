const prism = require('prism-media');
const ytdl = require('ytdl-core');
const rethink = require('rethinkdbdash')();
const { createWriteStream } = require('fs');
const { performance: { now } } = require('perf_hooks');

(async () => await rethink.connect())();

const downloading = [];

process.on('message', message => {
	const start = now();
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

		if (currentlyDownloading) process.send({ type: 'log', data: `Already saving ${message.id}. Downloading instead.` });
		else process.send({ type: 'log', data: `Downloading and writing ${message.id} to the database.` });

		if (!currentlyDownloading) {
			muxer.on('data', chunk => {
				chunks.push(chunk);
			});
		}

		muxer.on('end', async () => {
			const downloadTime = now() - start;

			downloading.splice(downloading.indexOf(message.id));
			if (!currentlyDownloading) {
				await rethink.table('audio').insert({
					id: message.id,
					files: chunks
				});
				const writeTime = now() - start;
				process.send({ type: 'log', data: `Downloaded ${message.id} in ${downloadTime.toFixed(2) / 1000}s. Written in: ${writeTime.toFixed(2) / 1000}s.`, downloadTime, writeTime });
			} else { process.send({ type: 'log', data: `Downloaded ${message.id} in ${downloadTime.toFixed(2) / 1000}s`, downloadTime }); }

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
			const writeTime = now() - start;
			process.send({ type: 'log', data: `[QUEUE] Saved ${message.id} to the database in ${writeTime}ms.`, writeTime });

			process.send({ done: true, id: message.id, pipeIndex: message.pipe });
		});
	}
});
