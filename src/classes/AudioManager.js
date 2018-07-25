const rethink = require('rethinkdbdash')();
const { fork } = require('child_process');
const { join } = require('path');
const ytdl = require('ytdl-core');

const ArrayBufferStream = require('./ArrayBufferStream');

const YOUTUBE_REGEX = /^.*(youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/;

const openPipes = [];
const newPipes = [];
const pipeArgs = [];

class AudioManager {

	constructor(client, maxConnections = 10, maxThreads = 20, queueOnThreadLimit = false) {
		this.cache = new Map();
		this.ready = false;
		this.threads = [];
		this.maxConnections = maxConnections;
		this.maxThreads = maxThreads;
		this.client = client;
		this.queueOnThreadLimit = queueOnThreadLimit;
		this.queue = {
			thread: null,
			queued: [],
			openPipes: []
		};
		this.downloadTimes = [];
		this.writeTimes = [];
	}

	async init() {
		await rethink.connect();
		const tableList = await rethink.tableList().run();

		if (!tableList.includes('audio')) {
			await rethink.tableCreate('audio').run();
			this.client.console.write(['Created the table "audio".'], 'thread');
		}
		const data = await rethink.table('audio').run();

		for (const { id, files } of data) {
			this.cache.set(id, files);
		}

		for (let i = 0; i < this.maxConnections; i++) {
			openPipes.push(i + 4);
			pipeArgs.push('pipe');
		}

		for (let i = 1; i < this.maxConnections; i++) {
			newPipes.push(i - 1 + 4);
		}

		const thread = fork(join(process.cwd(), 'src/classes/DownCoder'), [], { stdio: [process.stdin, process.stdout, process.stderr, 'ipc', ...pipeArgs] });

		if (this.queueOnThreadLimit) {
			this.queue.thread = fork(join(process.cwd(), 'src/classes/DownCoder'), { stdio: [process.stdin, process.stdout, process.stderr, 'ipc', ...pipeArgs] });
			this.queue.thread.on('message', message => {
				if (message.done) {
					this.queue.openPipes.push(message.pipeIndex);
				} else if (message.type === 'log') {
					this.client.console.write([message.data], 'thread');
					if (message.downloadTime) this.downloadTimes.push(message.downloadTime);
					if (message.writeTime) this.writeTimes.push(message.writeTime);
				}
			});
			this.queue.openPipes = openPipes;
		}

		thread.on('message', message => {
			if (message.done) {
				this.threads[0].openPipes.push(message.pipeIndex);
			} else if (message.type === 'log') {
				this.client.console.write([message.data], 'thread');
				if (message.downloadTime) this.downloadTimes.push(message.downloadTime);
				if (message.writeTime) this.writeTimes.push(message.writeTime);
			}
		});

		this.threads.push({ thread, openPipes });

		this.ready = true;
		return true;
	}

	async playTrack(song) {
		if (!this.ready) throw new Error('Unready state');

		const id = song.match(YOUTUBE_REGEX)[2];

		if (this.cache.has(id)) {
			this.client.console.write([`Playing ${id} from cache!`], 'thread');
			return new ArrayBufferStream(this.cache.get(id));
		} else {
			return this.doDownload(song, id);
		}
	}

	doDownload(url, id) {
		let downCoder = this.threads.find(thread => thread.openPipes.length > 0);

		let output;

		if (!downCoder) {
			if (this.threads.length < this.maxThreads) {
				this.client.console.log([`Creating new thread. Current thread count: ${this.threads.length}.`], 'thread');
				const forked = fork(join(process.cwd(), 'src/classes/DownCoder'), [], { stdio: [process.stdin, process.stdout, process.stderr, 'ipc', ...pipeArgs] });
				const index = this.threads.push({ thread: forked, newPipes }) - 1;
				forked.on('message', message => {
					if (message.done) {
						this.threads[index].openPipes.push(message.pipeIndex);
					} else if (message.type === 'log') {
						this.client.console.write([message.data], 'thread');
						if (message.downloadTime) this.downloadTimes.push(message.downloadTime);
						if (message.writeTime) this.writeTimes.push(message.writeTime);
					}
				});
				downCoder = forked;

				downCoder.send({ command: 'download', id, url, pipe: 4 });

				output = downCoder.stdio[4]; // eslint-disable-line prefer-destructuring
			} else {
				output = ytdl(url);
				if (this.queueOnThreadLimit) this.queue.queued.push(url);
			}
		} else {
			output = downCoder.thread.stdio[downCoder.openPipes[0]];
			downCoder.thread.send({ command: 'download', id, url, pipe: downCoder.openPipes[0] });
			downCoder.openPipes.shift();
		}

		const _chunks = [];

		output.on('data', chunk => {
			_chunks.push(chunk);
		});

		output.on('end', () => this.cache.set(id, _chunks));

		return output;
	}

	checkQueue() {
		if (this.queue.queued.length > 0 && this.queue.openPipes > 0) {
			const id = this.queue.queued[0].match(YOUTUBE_REGEX)[2];
			const song = this.queue.queued.shift();
			const pipe = this.queue.openPipes.shift();

			this.queue.thread.send({ command: 'download', id, song, pipe, noReturn: true });
		}
	}

	get cacheSize() {
		let size;
		for (const data of this.cache.values()) {
			size = data.reduce((acc, curr) => acc + curr.byteLength, 0);
		}
		return size;
	}

}

module.exports = AudioManager;
