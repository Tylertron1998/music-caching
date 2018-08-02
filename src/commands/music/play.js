const { Command } = require('klasa');

module.exports = class extends Command {

	constructor(...args) {
		super(...args, {
			permissionLevel: 2,
			usage: '<url:string>'
		});
	}

	async run(message, [url]) {
		if (!message.member.voiceChannel) return message.sendMessage('Join a voice channel you fucking dingus.');

		const conn = await message.member.voiceChannel.join();
		conn.play(await this.client.audioManager.playTrack(url), { type: 'ogg/opus' });
		return message.react('✅');
	}

};
