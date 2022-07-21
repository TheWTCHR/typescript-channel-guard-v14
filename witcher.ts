import { Client, Colors, GatewayIntentBits, GuildTextBasedChannel, Partials } from 'discord.js';
import config  from './config';
import mongoose from 'mongoose';
import safeUserData from './models/safeUser';
import safeRoleData from './models/safeRole';

const client = new Client({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences],
    partials: [Partials.Message]
});

async function safeControl(guildID: string, memberID: string) {
    let userData = await safeUserData.findOne({ guildID: guildID, memberID: memberID});
    let roleData = await safeRoleData.findOne({ guildID: guildID })
    let member = client.guilds.cache.get(config.guildID).members.cache.get(memberID);
    if(userData) {
        if(userData.safeState || member.id == client.user.id || member.roles.cache.get(roleData.roleID) || member.id == member.guild.ownerId) return true 
        else return false;
    } else {
        return false;
    }
};

async function punish(memberID: string, type: string) {
    let member = client.guilds.cache.get(config.guildID).members.cache.get(memberID)
    if(type == "ban") {
        await member.guild.bans.create(member.id, {reason: "Witcher Guard"}).catch(_err => {});
    } else if(type == "jail"){
        let roller = [config.jailRole];
        let roles = member.roles.cache.clone().filter(e => e.editable).map(e => e.id).concat(roller);
        return await member.roles.set(roles, "Witcher Guard").catch(_err => {});
    } else {
        console.error("Geçerli bir ceza tipi giriniz.")
    }
};

client.on("ready", async () => {
    client.user.setActivity('Witcher Typescript Guard')
    mongoose.connect(config.mongoURL);
    console.info("Bota giriş yapıldı.")
});

client.on("messageCreate", async (message) => {
    if(!config.botOwners.some(owner => message.author.id == owner)) return;
    let sahincanfx = message.content.split(" ")[0].slice(config.prefix.length); // sahincanfx'e slm (sahin#1000)
    if(sahincanfx == "safe") {
        let role = message.mentions.roles.first();
        let member = message.mentions.users.first();
        if(role) {
            let roleData = await safeRoleData.findOne({ guilID: message.guild.id, roleID: role.id});
            if(!roleData) {
                new safeRoleData({ guildID: message.guild.id, roleID: role.id, safeState: true }).save();
                message.reply({ embeds: [{description: `${role} rolü güvenliye alındı.`, color: Colors.White}] });
            } else {
                if(roleData.safeState) {
                    await safeRoleData.updateOne({ guildID: message.guild.id, roleID: role.id}, {$set: {safeState: false}});
                    message.reply({ embeds: [{description: `${role} rolü güvenliden çıkarıldı.`, color: Colors.White}] });
                } else {
                    await safeRoleData.updateOne({ guildID: message.guild.id, roleID: role.id}, {$set: {safeState: true}});
                    message.reply({ embeds: [{description: `${role} rolü güvenliye alındı.`, color: Colors.White}] });
                }
            };
        };
        if(member) {
            let memberData = await safeUserData.findOne({ guildID: message.guild.id, memberID: member.id});
            if(!memberData) {
                new safeUserData({ guildID: message.guild.id, memberID: member.id, safeState: true}).save();
                message.reply({ embeds: [{description: `${member} üyesi güvenliye alındı.`, color: Colors.White}] });
            } else {
                if(memberData.safeState) {
                    await safeRoleData.updateOne({ guildID: message.guild.id, roleID: role.id}, {$set: {safeState: false}});
                    message.reply({ embeds: [{description: `${member} üyesi güvenliden çıkarıldı.`, color: Colors.White}] });
                } else {
                    await safeRoleData.updateOne({ guildID: message.guild.id, roleID: role.id}, {$set: {safeState: true}});
                    message.reply({ embeds: [{description: `${member} üyesi güvenliye alındı.`, color: Colors.White}] });
                }
            }
        }
    };
});

client.on("channelCreate", async (channel) => {
    let entry = await channel.guild.fetchAuditLogs({ type: 10 }).then((wtchr) => wtchr.entries.first());
    if(!entry || !entry.executor || await safeControl(channel.guild.id, entry.executor.id) || Date.now()-entry.createdTimestamp > 5000) return;
    punish(entry.executor.id, "jail");
    await channel.delete('Witcher Guard').catch(err => {});
    let logChannel = client.channels.cache.get(config.channelLog) as GuildTextBasedChannel;
    await logChannel.send({ embeds: [{description: `${entry.executor.username} tarafından kanal oluşturuldu ve üye jaile atıldı.`, footer: {text: "Witcher Guard Log"}}] });
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
    if(oldChannel.isDMBased() || newChannel.isDMBased()) return;
    let entry = await newChannel.guild.fetchAuditLogs({ type: 11 }).then(wtchr => wtchr.entries.first());
    if(!entry || !entry.executor || await safeControl(newChannel.guild.id, entry.executor.id) || Date.now()-entry.createdTimestamp > 5000) return;
    punish(entry.executor.id, "jail");
    let logChannel = client.channels.cache.get(config.channelLog) as GuildTextBasedChannel;
    await logChannel.send({ embeds: [{description: `${entry.executor.username} tarafından kanal güncellendi ve üye jaile atıldı.`, footer: {text: "Witcher Guard Log"}}] });
});

client.on("channelDelete", async (channel) => {
    if(channel.isDMBased()) return;
    let entry = await channel.guild.fetchAuditLogs({ type: 12 }).then(wtchr => wtchr.entries.first());
    if(!entry || !entry.executor || await safeControl(channel.guild.id, entry.executor.id) || Date.now()-entry.createdTimestamp > 5000) return;
    punish(entry.executor.id, "ban");
    let logChannel = client.channels.cache.get(config.channelLog) as GuildTextBasedChannel;
    await logChannel.send({ embeds: [{description: `${entry.executor.username} tarafından kanal silindi ve üye yasaklandı.`, footer: {text: "Witcher Guard Log"}}] });
});

client.login(config.botToken);
