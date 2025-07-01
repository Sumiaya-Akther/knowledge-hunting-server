const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const admin = require("firebase-admin");

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
// const serviceAccount = JSON.parse(decoded);

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mdnalzr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// jwt middlewares

const verifyJWT = async (req, res, next) => {
    const token = req?.headers?.authorization?.split(' ')[1];
    console.log(token);
    if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })

    //verify token using firebase admin sdk

    try {
        const decoded = await admin.auth().verifyIdToken(token)
        req.tokenEmail = decoded.email
        next()

    } catch (err) {
        console.log(err);
        return res.status(401).send({ message: 'Unauthorized Access!' })
    }

}

async function run() {
    try {

        // await client.connect();

        const articlesCollection = client.db('knowledge-hunting').collection('articles');
        const commentsCollection = client.db('knowledge-hunting').collection("comments");

        //generate jwt

        // app.post('/jwt', (req, res) => {
        //     const user = { email: req.body.email }
        //     //token creation
        //     const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        //         expiresIn: '7d',
        //     })
        //     res.send({ token, message: 'jwt created successfully!' })
        // });


        //all articles get api call

        // app.get('/articles', async (req, res) => {
        //     //   const cursor = groupsCollection.find();
        //     //   const result = await cursor.toArray();
        //     const result = await articlesCollection.find().toArray();
        //     res.send(result);
        // });


        //------------------------------>


        // category based articles get apii----->
        app.get('/articles', async (req, res) => {
            try {
                const { category } = req.query;
                const filter = {};

                if (category && category !== 'All') {
                    filter.category = category;
                }

                const articles = await articlesCollection.find(filter).toArray();

                res.send({ data: articles });
            } catch (error) {
                console.error('Error fetching articles:', error);
                res.status(500).send({ error: 'Server error' });
            }
        });
        //----------------------------->


        app.get('/articles/category/:category', async (req, res) => {
            const category = req.params.category;
            const result = await articlesCollection.find({ category }).toArray();

            res.send({ data: result });
            console.log(result);
        });



        // get 6 recent or popular articles(featured articles)
        app.get("/featured-articles", async (req, res) => {
            const articles = await articlesCollection
                .find({})
                // .sort({ date: -1 }) // Sort by most recent
                // .limit(6)
                .toArray();
            const reversedArticles = articles.reverse();
            res.send(reversedArticles);
        });



        //get single article details by id-------->

        app.get('/article/:id', async (req, res) => {
            const id = req.params.id;
            const article = await articlesCollection.findOne({ _id: new ObjectId(id) });
            res.send(article);
        });


        // ------------->

        // TOTAL groups
        app.get('/articles/count', async (req, res) => {
            try {
                const total = await articlesCollection.estimatedDocumentCount();
                res.json({ count: total });
            } catch (e) {
                res.status(500).json({ message: e.message });
            }
        });

        // LOGGED-IN user’s groups
        app.get('/myarticles/count', async (req, res) => {
            const email = req.query.email;
            if (!email) return res.status(400).json({ message: 'email required' });

            try {
                const myCount = await articlesCollection.countDocuments({
                    author_email: email
                });
                res.json({ count: myCount });
            } catch (e) {
                res.status(500).json({ message: e.message });
            }
        });


        // backend (Express + MongoDB aggregate)
        app.get('/top-contributors', async (req, res) => {
            try {
                const top = await articlesCollection.aggregate([
                    {
                        $group: {
                            _id: "$author_email",
                            name: { $first: "$author_name" },
                            photo: { $first: "$author_photo" },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { count: -1 } },
                    { $limit: 5 }
                ]).toArray();
                res.send(top);
            } catch (err) {
                res.status(500).send({ message: "Failed to get top contributors" });
            }
        });



        // ---------->


        //handle like toggle

        app.patch('/like/:articleId', async (req, res) => {
            const id = req.params.articleId;
            const email = req.body.email;
            const filter = { _id: new ObjectId(id) }
            const article = await articlesCollection.findOne(filter);
            //check if the user has already liked the article or not
            const alreadyLiked = article?.likedBy.includes(email);
            const updateDoc = alreadyLiked ? {
                $pull: {        //deslik
                    likedBy: email
                }
            } : {
                $addToSet: {     //like
                    likedBy: email
                }
            }

            await articlesCollection.updateOne(filter, updateDoc);
            res.send({
                message: alreadyLiked ? "Dislike successfull" : "like successfull",
                liked: !alreadyLiked
            });
        })





        //get my articles---->

        // app.get("/my-articles", async (req, res) => {
        //     const email = req.query.email;
        //     const result = await articlesCollection.find({ "author_email": email }).toArray();
        //     res.send(result);
        // });


        app.get('/my-articles/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.tokenEmail != email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const myArticle = await articlesCollection.find({ "author_email": email }).toArray();
            res.send(myArticle);
        });


        // DELETE group by ID------->


        app.delete("/deletearticle/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            const result = await articlesCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        //update article---------->


        // app.put('/updatearticle', async (req, res) => {
        //     try {
        //         const data = req.body;
        //         const filter = { _id: new ObjectId(data.groupId) };
        //         const replace = data

        //         console.log(replace, filter);
        //         const result = await articlesCollection.replaceOne(filter, replace);
        //         res.status(200).json(result);
        //     } catch (err) {
        //         console.error("Error updating group:", err);
        //         res.status(500).json({ message: "Internal server error" });
        //     }
        // });


        app.put('/updatearticle', verifyJWT, async (req, res) => {
            try {
                const { articleId, ...updatedFields } = req.body;

                const filter = { _id: new ObjectId(articleId) };
                const updateDoc = { $set: updatedFields };

                const result = await articlesCollection.updateOne(filter, updateDoc);
                res.status(200).json(result);
            } catch (err) {
                console.error("Error updating article:", err);
                res.status(500).json({ message: "Internal server error" });
            }
        });


        //all articles post api call---------->

        app.post('/articles', verifyJWT, async (req, res) => {
            const newArticles = req.body;
            //console.log(newArticles);
            const result = await articlesCollection.insertOne(newArticles);
            res.send(result);

        });


        // article comment save to the db (post api)-------->

        app.post("/comments", async (req, res) => {
            const { article_id, user_id, user_name, user_photo, comment } = req.body;

            if (!article_id || !user_id || !comment) {
                return res.status(400).send({ error: "Missing required fields" });
            }

            const newComment = {
                article_id,
                user_id,
                user_name,
                user_photo,
                comment,
                date: new Date().toLocaleString(), // optional
            };

            try {
                const result = await commentsCollection.insertOne(newComment);
                res.send({ insertedId: result.insertedId });
            } catch (error) {
                console.error("Error inserting comment:", error);
                res.status(500).send({ error: "Failed to save comment" });
            }
        });


        app.get('/comments', async (req, res) => {
            //   const cursor = commentsCollection.find();
            //   const result = await cursor.toArray();
            const result = await commentsCollection.find().toArray();
            res.send(result);
        });




        // Send a ping to confirm a successful connection
        //await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        //await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Hello knowledge hunting server!')
});

app.listen(port, () => {
    console.log(`knowledge hunting listening on port ${port}`)
});

