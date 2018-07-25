const { Command } = require('klasa');
const { MessageEmbed } = require('discord.js');
const ytdl = require('ytdl-core');

const average = (acc, curr) => curr + acc;

module.exports = class extends Command {

	constructor(...args) {
		super(...args, {
			runIn: ['text'],
			usage: '<add|play|stats> [song:str] [...]',
			usageDelim: ' ',
			quotedStringSupport: false,
			subcommands: true
		});
		this.queue = [];
		this.dispatcher = null;
	}

	async add(message, [...song]) {
		this.queue.push(song.join(' '));
		return message.sendMessage(`Okay, added: ${(await ytdl.getInfo(song.join(' '))).title} to the queue.`);
	}

	async play(message) {
		message.member.voiceChannel.join().then(async conn => {
			this.dispatcher = conn.play(await this.client.audioManager.playTrack(this.queue.shift()));
			this.dispatcher.on('end', async () => {
				if (this.queue.length) this.dispatcher = conn.play(await this.client.audioManager.playTrack(this.queue.shift()));
			});
		});
	}

	async stats(message) {
		const msg = await message.sendMessage('loading stats...');
		const embed = new MessageEmbed()
			.setColor('#5c00ff')
			.setTitle('Stats')
			.addField('Cached songs:', this.client.audioManager.cache.size, true)
			.addField('Cache size:', `${(this.client.audioManager.cacheSize / 1024 / 1024).toFixed(2)}MB`, true)
			.addField('Average download time:',
				`${this.client.audioManager.downloadTimes.length ? (this.client.audioManager.downloadTimes.reduce(average, 0) / this.client.audioManager.downloadTimes.length).toFixed(4) * 1000 : 0}s`)
			.addField('Average write time:',
				`${this.client.audioManager.writeTimes.length ? (this.client.audioManager.writeTimes.reduce(average, 0) / this.client.audioManager.writeTimes.length).toFixed(4) * 1000 : 0}s`, true)
			.addField('Current threads:', `${this.client.audioManager.threads.length}/${this.client.audioManager.maxThreads}`);

		let index = 0;
		for (const thread of this.client.audioManager.threads) {
			embed.addField(`Thread[${index}]:`, `Used: ${this.client.audioManager.maxConnections - thread.openPipes.length}/${this.client.audioManager.maxConnections}`, true);
			index++;
		}

		if (this.client.audioManager.queueOnThreadLimit) {
			embed.addField('Queue thread:', `Used: ${this.client.audioManager.maxConnections - this.client.audioManager.queue.openPipes.length}/${this.client.audioManager.maxConnections}`);
		}

		embed.setTimestamp();

		return msg.edit({ embed });
	}

};
