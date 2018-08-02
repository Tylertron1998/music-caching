const { Command } = require('klasa');
const { MessageEmbed } = require('discord.js');
const ytdl = require('ytdl-core');
const ytpl = require('ytpl');

const average = (acc, curr) => curr += acc; //eslint-disable-line

/* eslint-disable no-extra-parens */
module.exports = class extends Command {

	constructor(...args) {
		super(...args, {
			runIn: ['text'],
			usage: '<reset|stats|playlist|badStuff> [song:str] [...]',
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
		const conn = await message.member.voiceChannel.join();
		this.dispatcher = conn.play(await this.client.audioManager.playTrack(this.queue.shift()));
	}

	async stats(message) {
		const msg = await message.sendMessage('loading stats...');

		const dbSize = await this.client.providers.default.db.db('rethinkdb').table('stats')
			.filter({ table: 'audio' })
			.map(doc => doc('storage_engine')('disk')('space_usage')('data_bytes').default(0))
			.sum().div(1024)
			.div(1024)
			.default(0);

		const embed = new MessageEmbed()
			.setColor('#5c00ff')
			.setTitle('Stats')
			.addField('Cached songs:', this.client.audioManager.cache.size, true)
			.addField('Cache size:', `${(this.client.audioManager.cacheSize / 1024 / 1024).toFixed(2)}MB`, true)
			.addField('DB Size: ', `${dbSize.toFixed(2)}MB`)
			.addField('Average download time:',
				`${this.client.audioManager.downloadTimes.length ? (
					(this.client.audioManager.downloadTimes.reduce(average, 0) / this.client.audioManager.downloadTimes.length) / 1000).toFixed(2) / 1000 : 0}s`)
			.addField('Average write time:',
				`${this.client.audioManager.writeTimes.length ? ((this.client.audioManager.writeTimes.reduce(average, 0) / this.client.audioManager.writeTimes.length) / 1000).toFixed(4) : 0}s`, true)
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

	async reset(message) {
		if (message.author.id !== this.client.owner.id) {
			this.client.configs.update(['userBlacklist'], [message.author.id]);
			return message.sendMessage('NO.');
		} else {
			return this.client.providers.default.db.table('audio').delete().run().then(() => message.sendMessage(':C'));
		}
	}

	async badStuff(message) {
		if (message.author.id !== this.client.owner.id) {
			this.client.configs.update(['userBlacklist'], [message.author.id]);
			return message.sendMessage('NO.');
		} else {
			for (const item of this.queue) {
				this.client.audioManager.playTrack(item);
			}
			return message.sendMessage('C:');
		}
	}

	async playlist(message, [...pl]) {
		if (message.author.id !== this.client.owner.id) {
			this.client.configs.update(['userBlacklist'], [message.author.id]);
			return message.sendMessage('NO.');
		} else {
			const playlist = await ytpl(pl.join(' '));
			this.queue = playlist.items.map(item => item.url_simple);
		}
		return message.sendMessage(`Queue is now: ${this.queue.length} long. C:${'!'.repeat(this.queue.length * 5)}`);
	}

};
