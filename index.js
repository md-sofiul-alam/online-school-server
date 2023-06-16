const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')

// middleware
const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];


  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    req.decoded = decoded;
    next();
  })
}



const uri = `mongodb+srv://${process.env.USER}:${process.env.PASSWORD}@cluster0.y3pevx4.mongodb.net/?retryWrites=true&w=majority`


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const usersCollection = client.db('artsCraftsDb').collection('users')
    const classesCollection = client.db('artsCraftsDb').collection('classes')
    const enrolledCollection = client.db('artsCraftsDb').collection('enrolled')
    const paymentsCollection = client.db('artsCraftsDb').collection('payments')

    // JWT token api
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })


    // send user to DB
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: "user already exists" })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })

    // receive data
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })
    //===================== admin api
    // check a user is admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result)
    })



    // api for admin
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // api for Instructor
    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          rol: 'instructor'
        }
      }
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })



    // =======================================
    // Classes
    app.post('/classes', async (req, res) => {
      const aClass = req.body;
      const result = await classesCollection.insertOne(aClass);
      res.send(result)
    })

    // receive classes
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray()
      res.send(result)
    })

    // Read Single Data from database
    app.get('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      res.send(result);
    })

    // send enrolled class to db
    app.put('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedClass = req.body;
      const aClass = {
        $set: {
          availableSeats: updatedClass.availableSeats,
          enroll: updatedClass.enroll
        }
      }
      const result = await classesCollection.updateOne(filter, aClass, options);
      res.send(result)
    })

    // api for approved class
    app.patch('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: 'approved'
        }
      }
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // ===================================================
    // send user to DB
    app.post('/enrolled', async (req, res) => {
      const user = req.body;
      const result = await enrolledCollection.insertOne(user);
      res.send(result)
    })

    // Receive enrolled Class
    app.get('/enrolled', verifyJWT, async (req, res) => {

      //====================================
      // const email = re.query.email;
      // if (!email) {
      //   res.send([])
      // }
      // const query = { email: email };
      // const decodedEmail = req.decoded.email;
      // if (email !== decodedEmail) {
      //   return res.status(403).send({ error: true, message: 'forbidden access' })
      // }

      // const result = await enrolledCollection.find(query).toArray()
      //=====================================

      const result = await enrolledCollection.find().toArray()
      res.send(result)
    })

    // Delete enrolled Item
    app.delete('/enrolled/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await enrolledCollection.deleteOne(query);
      res.send(result);
    })

    // create payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    // Payment related API
    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment);

      const query = { _id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
      const deleteResult = await enrolledCollection.deleteMany(query);

      res.send({ insertResult, deleteResult })
    })

    app.get('/payments/:email', async (req, res)=> {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentsCollection.find(query).toArray();
      res.send(result)
    })


    // app.get('/users/:email', async (req, res) => {
    //   const email = req.params.email
    //   const query = { email: email }
    //   const result = await usersCollection.findOne(query)
    //   res.send(result)
    // })


    // app.get('/rooms/:email', verifyJWT, async (req, res) => {
    //   const email = req.params.email
    //   const query = { 'host.email': email }
    //   const result = await roomsCollection.find(query).toArray()
    //   res.send(result)
    // })






    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('EEE School is running..')
})

app.listen(port, () => {
  console.log(`EEE School is running on port ${port}`)
})