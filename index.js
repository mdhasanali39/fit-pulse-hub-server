import express from "express";
import cors from "cors";
import "dotenv/config";
import cron from "node-cron";
import stripe from "stripe";
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

// create express instance
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://console.firebase.google.com/project/fit-pulse-hub-web-app/overview",
      "https://fit-pulse-hub-web-app.web.app",
    ],
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// custom middlewares
// verifyToken
const verifyToken = async (req, res, next) => {
  // console.log(req.headers.authorization);
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  // console.log(token);
  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
    // console.log(decoded);
    next();
  });
};

// mongodb connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@fitpulse1.ps5dyrp.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // create database and collection
    const userCollection = client.db("fitpulsehubDb").collection("users");
    const classCollection = client.db("fitpulsehubDb").collection("classes");
    const trainerCollection = client.db("fitpulsehubDb").collection("trainers");
    const timeslotCollection = client
      .db("fitpulsehubDb")
      .collection("timeslots");
    const membershipCollection = client
      .db("fitpulsehubDb")
      .collection("memberships");
    const subscriberCollection = client
      .db("fitpulsehubDb")
      .collection("subscribers");
    const paymentCollection = client.db("fitpulsehubDb").collection("payments");
    const forumpostCollection = client
      .db("fitpulsehubDb")
      .collection("forumposts");

    // all get api

    // get user role
    app.get("/api/v1/user-role/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };
      const user = await userCollection.findOne(query);
      const role = user.role;
      res.send({ role });
    });
    // get - individual user and user how many days older are
    app.get("/api/v1/get-user/:email", async (req, res) => {
      try {
        const onlyId = req.query.onlyId;
        const userEmail = req.params.email;
        const query = { email: userEmail };
        const user = await userCollection.findOne(query);
        if (!user) {
          return console.log("User not found");
        }
        if (onlyId) {
          return res.send({ userId: user?._id });
        }

        const timeStamp = user?.timeStamp;
        const currentDate = new Date().getTime();
        const differ = currentDate - timeStamp;
        const totalDays = Math.floor(differ / (1000 * 60 * 60 * 24));
        res.send({ totalDays });
      } catch (err) {
        console.log(err);
      }
    });
    // is trainer unverified
    app.get("/api/v1/unverified-trainer/:email", async (req, res) => {
      try {
        const userEmail = req.params.email;
        const query = { trainer_email: userEmail };
        const trainer = await trainerCollection.findOne(query);
        let isTrainer = false;
        if (trainer && trainer.status === "verified") {
          isTrainer = true;
        } else if (trainer && trainer.status === "unverified") {
          isTrainer = false;
        }
        res.send({ isTrainer });
      } catch (err) {
        console.log(err);
      }
    });

    // get all trainers data that are verified
    app.get("/api/v1/trainers", async (req, res) => {
      // console.log('hit');
      const query = { status: "verified" };
      const result = await trainerCollection.find(query).toArray();
      res.send(result);
    });
    // get all applied trainers data
    app.get("/api/v1/applied-trainers", async (req, res) => {
      const query = { status: "unverified" };
      const result = await trainerCollection.find(query).toArray();
      res.send(result);
    });

    // get single trainer data
    app.get("/api/v1/trainer/:email", async (req, res) => {
      const Email = req.params.email;
      const query = { trainer_email: Email };
      const trainer = await trainerCollection.findOne(query);
      res.send(trainer);
    });
    // get all forum posts
    app.get("/api/v1/all-forum-posts", async (req, res) => {
      const posts = await forumpostCollection.find().toArray();
      res.send(posts);
    });
    // get all timeSlots
    app.get("/api/v1/time-slots", async (req, res) => {
      const timeSlots = await timeslotCollection.find().toArray();
      res.send(timeSlots);
    });
    // get single slot
    app.get("/api/v1/time-slot/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const slot = await timeslotCollection.findOne(query);
      res.send(slot);
    });
    // get all newsletter subscriber
    app.get("/api/v1/subscribers", async (req, res) => {
      const result = await subscriberCollection.find().toArray();
      res.send(result);
    });
    // get - count total newsletter subscribers and total paid members
    app.get("/api/v1/count-subscribers-memberships", async (req, res) => {
      const totalSubscribersCount =
        await subscriberCollection.estimatedDocumentCount();
      const totalPaidMembersCount =
        await membershipCollection.estimatedDocumentCount();
      res.send({ totalSubscribersCount, totalPaidMembersCount });
    });
    // get state - total memberships payment amount made by member and total admin payment to trainer
    app.get("/api/v1/total-payment-stat", async (req, res) => {
      const result1 = await membershipCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalPayment: { $sum: { $toDecimal: "$package_price" } },
            },
          },
        ])
        .toArray();
      const membersPaymentTotal =
        result1.length > 0 ? result1[0].totalPayment : 0;

      const result2 = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalPayment: { $sum: { $toDecimal: "$total_amount" } },
            },
          },
        ])
        .toArray();
      const adminPaymentTotal =
        result2.length > 0 ? result2[0].totalPayment : 0;

      res.send({
        membersPayment: membersPaymentTotal,
        adminPayment: adminPaymentTotal,
      });
    });

    // get last six payments transaction - made by members
    app.get("/api/v1/payments/last-six", async (req, res) => {
      try {
        const result = await membershipCollection
          .find()
          .sort({ timeStamp: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });
    // get all classes
    app.get("/api/v1/all-classes", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    // get single class
    app.get("/api/v1/single-class/:id", async (req, res) => {
      const query = { _id: new ObjectId(req?.params?.id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    // get who booked particular slot of particular trainer
    app.get("/api/v1/booked-slots/:email", async (req, res) => {
      const trainerEmail = req.params.email;
      const query = { trainer_email: trainerEmail };
      const bookedByMembers = await membershipCollection.find(query).toArray();
      const bookedMemberName = bookedByMembers.map((b) => b?.member_name);
      const bookedSlotIds = bookedByMembers.map((b) => b?.slot_id);
      const queryIds = {
        _id: {
          $in: bookedSlotIds.map((id) => new ObjectId(id)),
        },
      };
      const options = {
        projection: { _id: 1 },
      };
      const findBookedSlotsIds = await timeslotCollection
        .find(queryIds, options)
        .toArray();

      res.send({ findBookedSlotsIds, bookedMemberName });
    });

    // get all bookedMembers - trainer specific
    app.get("/api/v1/all-booked-by-members/:email", async (req, res) => {
      const trainerEmail = req.params.email;
      const query = { trainer_email: trainerEmail };
      const options = {
        projection: {
          member_name: 1,
          member_email: 1,
          member_photo: 1,
          slot_name: 1,
        },
      };
      const allBookedMembers = await membershipCollection
        .find(query, options)
        .toArray();
      res.send(allBookedMembers);
    });

    // get single booked by member
    app.get("/api/v1/single-booked-by-member/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { member_email: userEmail };
      const booked = await membershipCollection.findOne(query);
      res.send(booked);
    });

    // all post api
    // save users
    app.post("/api/v1/create-user/:email", async (req, res) => {
      try {
        const user = req.body;
        const userEmail = req.params.email;
        // console.log(userEmail);
        const query = { email: userEmail };
        const isExist = await userCollection.findOne(query);
        if (isExist) {
          console.log("user already exist");
          return;
        }
        // const date = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
        const userData = {
          ...user,
          timeStamp: Date.now(),
        };
        const result = await userCollection.insertOne(userData);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // save trainers
    app.post("/api/v1/save-trainer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { trainer_email: email };
      const isExist = await trainerCollection.findOne(query);
      if (isExist) {
        res.send({ status: "You already applied" });
        return;
      }
      const trainerData = req.body;
      const result = await trainerCollection.insertOne(trainerData);
      res.send(result);
    });
    // save memberships to database
    app.post("/api/v1/memberships", async (req, res) => {
      const payment = req.body;
      const paymentData = {
        ...payment,
        timeStamp: Date.now(),
      };
      const result = await membershipCollection.insertOne(paymentData);
      res.send(result);
    });

    // save newsletter subscriber
    app.post("/api/v1/newsletter-subscriber/:email", async (req, res) => {
      const Email = req.params.email;
      const subscriber = req.body;
      const query = { subscriber_email: Email };
      const isExist = await subscriberCollection.findOne(query);
      if (isExist) {
        res.send({ user: "already subscribed" });
        return;
      }
      const subscriberData = {
        ...subscriber,
        created_at: Date.now(),
      };
      const result = await subscriberCollection.insertOne(subscriberData);
      res.send(result);
    });
    // save payment - payment by admin * trainer payment
    app.post("/api/v1/save-trainer-payment", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // save new class
    app.post("/api/v1/save-class/:email", async (req, res) => {
      const classData = req.body;
      const result = await classCollection.insertOne(classData);
      res.send(result);
    });

    // save forum post
    app.post("/api/v1/save-forum-post", async (req, res) => {
      const postData = req.body;
      const result = await forumpostCollection.insertOne({
        ...postData,
        timeStamp: Date.now(),
      });
      res.send(result);
    });

    // create payment intent - stripe
    app.post("/api/v1/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log('amount', amount);
      if (!price || amount < 1) return;
      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // create token
    app.post("/api/v1/create-token", async (req, res) => {
      const userEmail = req.body;
      const token = jwt.sign(userEmail, process.env.SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // all delete and update api
    // update trainer and user
    app.patch("/api/v1/update-trainer/:email/:id", async (req, res) => {
      console.log("hit");
      const email = req.params.email;
      const id = req.params.id;
      const status = req.body.status;
      const role = req.body.role;
      const query = { email: email };
      const updatedUser = {
        $set: {
          role: role,
          timeStamp: Date.now(),
        },
      };
      const userUpdated = await userCollection.updateOne(query, updatedUser);

      const filter = { _id: new ObjectId(id) };
      const updatedTrainer = {
        $set: {
          status: status,
          salary: "unpaid",
        },
      };
      const trainerUpdated = await trainerCollection.updateOne(
        filter,
        updatedTrainer
      );
      res.send({ trainerUpdated, userUpdated });
    });

    // update user profile
    app.put("/api/v1/update-user/:email", async (req, res) => {
      const userEmail = req.params.email;
      const userInfo = req.body;
      const filter = { email: userEmail };
      const options = { upsert: false };
      const updatedUserInfo = {
        $set: {
          ...userInfo,
        },
      };
      const result = await userCollection.updateOne(
        filter,
        updatedUserInfo,
        options
      );
      res.send(result);
    });

    // update trainer salary status to paid
    app.patch("/api/v1/update-trainers", async (req, res) => {
      const salaryStatus = req.body?.salary;
      // if(salaryStatus ==="unpaid"){
      //   const filter = {salary: "paid"}
      //   const result = await trainerCollection.updateMany(filter,{$set:{salary: salaryStatus}})
      //   return res.send(result)
      // }
      const filter = { salary: "unpaid" };
      const updatedSalaryStatus = {
        $set: {
          salary: salaryStatus,
        },
      };
      const result = await trainerCollection.updateMany(
        filter,
        updatedSalaryStatus
      );
      res.send(result);
    });

    const testFunc = async (req, res) => {
      cron.schedule('0 0 1 */1 *', async () => {
        const diffFunc = async () => {
          const salaryStatus = req.body?.salary;
          const filter = { salary: "paid" };
          const result = await trainerCollection.updateMany(filter, {
            $set: { salary: salaryStatus },
          });
          console.log("perfect");
          res.send(result);
        };
        await diffFunc();
      });
    };
    // update trainer salary status to unpaid
    app.patch("/api/v1/status-unpaid", testFunc);

    // upVote system
    app.put("/api/v1/upvote/:id", async (req, res) => {
      try {
        const postId = req.params.id;
        const userEmail = req.body.email.split(".").join("");
        // console.log(userEmail);

        const alreadyDownVoted = await forumpostCollection.findOne({
          _id: new ObjectId(postId),
          [`votedUser.${userEmail}`]: "downvote",
        });
        if (alreadyDownVoted) {
          // decrease upvote
          const decreaseDownvote = await forumpostCollection.updateOne(
            { _id: new ObjectId(postId) },
            { $inc: { downvotes: -1 } }
          );
          // console.log("decreaseDownvote",decreaseDownvote);
        }

        const userVoteStatus = await forumpostCollection.findOne({
          _id: new ObjectId(postId),
          [`votedUser.${userEmail}`]: "upvoted",
        });
        if (userVoteStatus) {
          return console.log("user already upVoted");
        }

        const result = await forumpostCollection.updateOne(
          { _id: new ObjectId(postId) },
          {
            $inc: { upvotes: 1 },
            $set: {
              [`votedUser.${userEmail}`]: "upvoted",
            },
          }
        );
        if (result.matchedCount === 0) {
          return "posted id not matched";
        }
        res.send(result);
      } catch (err) {
        console.log("error in catch block", err);
      }
    });
    // DownVote system
    app.put("/api/v1/downvote/:id", async (req, res) => {
      try {
        const postId = req.params.id;
        const userEmail = req.body.email.split(".").join("");
        // console.log(userEmail);

        const alreadyUpvoted = await forumpostCollection.findOne({
          _id: new ObjectId(postId),
          [`votedUser.${userEmail}`]: "upvoted",
        });
        if (alreadyUpvoted) {
          // decrease upvote
          const decreaseUpvote = await forumpostCollection.updateOne(
            { _id: new ObjectId(postId) },
            { $inc: { upvotes: -1 } }
          );
          // console.log("decreaseUpvote",decreaseUpvote);
        }

        const userVoteStatus = await forumpostCollection.findOne({
          _id: new ObjectId(postId),
          [`votedUser.${userEmail}`]: "downvote",
        });
        if (userVoteStatus) {
          return console.log("user already downVoted");
        }

        const result = await forumpostCollection.updateOne(
          { _id: new ObjectId(postId) },
          {
            $inc: { downvotes: 1 },
            $set: {
              [`votedUser.${userEmail}`]: "downvote",
            },
          }
        );
        if (result.matchedCount === 0) {
          return "posted id not matched";
        }
        res.send(result);
      } catch (err) {
        console.log("error in catch block", err);
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// testing api
app.get("/", (req, res) => {
  res.send("fit pulse server is running well");
});

app.listen(port, () => {
  console.log(`fit pulse server is running on port: ${port}`);
});
