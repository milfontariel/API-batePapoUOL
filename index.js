import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import joi from 'joi';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

setInterval(async () => {
    await mongoClient.connect();
    try {
        db = mongoClient.db("uol");
        const participantsCollection = db.collection("participants");
        const messagesCollection = db.collection("messages");
        const participants = await participantsCollection.find({}).toArray();

        participants.map(async user => {
            const time = Date.now();
            if(parseInt(user.lastStatus) < parseInt(time) - 10000){
                await participantsCollection.deleteOne({_id: user._id});
                await messagesCollection.insertOne({
                    from: user.name,
                    to: 'Todos',
                    text: 'sai na sala...',
                    type: "status",
                    time: dayjs(Date.now()).locale('pt').format('HH:mm:ss')
                });
            }
            mongoClient.close();
        });
    } catch (error) {
        console.log("Deu ruim, paizão");
        mongoClient.close();
    }
}, 15000);

const participantPostSchema = joi.object({
    name: joi.string().required(),
});
const messagePostSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().allow('message', 'private_message').required()
});

app.post("/participants", async (req, res) => {
    const validation = participantPostSchema.validate(req.body);
    if (validation.error) {
        res.status(422).send(validation.error.details.map(erro => {
            erro.message;
        }));
        mongoClient.close();
        return
    }
    try {
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const participantsCollection = db.collection("participants");
        const messagesCollection = db.collection("messages");
        const validate = await participantsCollection.findOne({ name: req.body.name });

        if (validate) {
            res.status(409).send("Usuário já existe")
            mongoClient.close();
        } else {
            await participantsCollection.insertOne({
                name: req.body.name,
                lastStatus: Date.now()
            });
            await messagesCollection.insertOne({
                from: req.body.name,
                to: 'Todos',
                text: 'entra na sala...',
                type: "status",
                time: dayjs(Date.now()).locale('pt').format('HH:mm:ss')
            });
            res.sendStatus(201);
            mongoClient.close();
        }

    } catch (error) {
        res.status(500).send(error);
        mongoClient.close();
    }
});

app.post("/messages", async (req, res) => {
    const validation = messagePostSchema.validate(req.body);
    if (validation.error) {
        res.status(422).send(validation.error.details.map(erro => {
            erro.message;
        }));
        mongoClient.close();
        return
    }
    try {
        const username = req.headers.user;
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const participantsCollection = db.collection("participants");
        const messagesCollection = db.collection("messages");
        const validate = await participantsCollection.findOne({ name: username });

        if (validate) {
            await messagesCollection.insertOne({
                ...req.body,
                from: username,
                time: dayjs(Date.now()).locale('pt').format('HH:mm:ss')
            });
            res.sendStatus(201);
            mongoClient.close();
        } else {
            res.status(422).send("deu berg, paizao");
            mongoClient.close();
        }

    } catch (error) {
        res.sendStatus(500);
        mongoClient.close();
    }
});

app.post("/status", async (req, res) => {
    try {
        const username = req.headers.user;
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const participantsCollection = db.collection("participants");
        const validate = await participantsCollection.findOne({ name: username });
        if (validate) {
            await participantsCollection.updateOne({ _id: validate._id }, { $set: { lastStatus: Date.now() } })
            res.sendStatus(200);
            mongoClient.close();
        } else {
            res.sendStatus(404);
            mongoClient.close();
            return
        }
    } catch (error) {
        res.status(500).send("Deu alguma merda aqui");
        mongoClient.close();
    }

});

app.get("/participants", async (req, res) => {
    try {
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const participantsCollection = db.collection("participants");
        const participants = await participantsCollection.find({}).toArray();
        res.status(201).send(participants);
    } catch (error) {
        res.sendStatus(500)
    }
});

app.get("/messages", async (req, res) => {
    const limit = req.query.limit;
    const username = req.headers.user;
    try {
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const messagesCollection = db.collection("messages");
        const messages = await messagesCollection.find({
            $or: [
                { to: username }, { from: username }, { to: "Todos" }
            ]
        }).toArray();
        if (limit) {
            const filterMessages = [...messages].reverse().slice(0, parseInt(limit)).reverse();
            res.send(filterMessages);
            mongoClient.close();
        } else {
            res.send(messages);
            mongoClient.close();
        }
    } catch (error) {
        res.sendStatus(500);
        mongoClient.close();
    }
});

app.delete("/messages/:messageId", async (req, res) => {
    try {
        const username = req.headers.user;
        const id = req.params.messageId;
        await mongoClient.connect();
        db = mongoClient.db("uol");
        const messagesCollection = db.collection("messages");
        const validate = await messagesCollection.findOne({_id: new ObjectId(id)});
        if(validate){
            if(validate.from == username){
                await messagesCollection.deleteOne({_id: new ObjectId(id)});
                res.sendStatus(200);
                mongoClient.close();
            } else {
                res.sendStatus(401)
                mongoClient.close();
            }
        } else {
            res.sendStatus(404);
            mongoClient.close();
        }
        
    } catch (error) {
        res.sendStatus(500);
        mongoClient.close();
    }
});

app.listen(5000);