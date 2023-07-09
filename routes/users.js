var express = require('express');
const router = express.Router();
const { User, validate } = require('../schemas/userSchema')
const mongoose = require('mongoose')
const { dbUrl } = require('../common/dbconfig')
const { hashPasswords, hashCompare, createToken } = require('../common/auth')
const crypto = require("crypto");
mongoose.connect(dbUrl)
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const saltRounds = 10
const Token = require("../schemas/tokenSchemas");
const nodemailer = require("nodemailer");


router.get('/', async function (req, res) {
  try {
    let users = await User.find({}, { password: 0 });
    res.status(200).send({
      users,
      message: "Users Data Fetch Successfull!"
    })
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error", error })
  }
});



router.post("/signup", async (req, res) => {
  try {
    const { error } = validate(req.body);
    if (error)
      return res.status(400).send({ message: error.details[0].message });

    let user = await User.findOne({ email: req.body.email });
    if (user)
      return res
        .status(409)
        .send({ message: "User with given email already Exist!" });
    const salt = await bcrypt.genSalt(Number(process.env.SALT));
    const hashPassword = await bcrypt.hash(req.body.password, salt);

    let hashedPassword = await hashPasswords(req.body.password)
    req.body.password = hashedPassword

    user = await new User({ ...req.body, password: hashPassword }).save();

    const token = await new Token({
      userId: user._id,
      token: crypto.randomBytes(32).toString("hex"),
    }).save();
    const url = `${process.env.BASE_URL}/${user.id}/verify/${token.token}`;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.G_MAIL,
        pass: process.env.G_MAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.G_MAIL,
      to: user.email,
      subject: "Verify Email",
      text: url,
    });
    console.log("email sent successfully");
    res
      .status(201)
      .send({ message: "An Email sent to your account please verify" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.get("/:id/verify/:token/", async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(400).send({ message: "Invalid link" });

    const token = await Token.findOne({
      userId: user._id,
      token: req.params.token,
    });
    if (!token) return res.status(400).send({ message: "Invalid link" });

    await User.updateOne({ 
      _id: user._id,
       verified: true
       });
    await token.remove();

    res.status(200).send({ message: "Email verified successfully" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Error 500" });
  }
});


router.post('/login', async (req, res) => {
  try {
    let user = await User.findOne({ email: req.body.email })
    if (user) {
      if (await hashCompare(req.body.password, user.password)) {

        let token = await createToken({
          name: user.name,
          email: user.email,
          id: user._id,
        })
        res.status(200).send({
          message: "User Login Successfull!",
          token
        })
      }
      else {
        res.status(402).send({ message: "Invalid Credentials" })
      }
    }
    else {
      res.status(400).send({ message: "User Does Not Exists!" })
    }

  } catch (error) {
    res.status(500).send({ message: "Internal Server Error", error })
  }
})

router.post('/forgotpassword', async (req, res) => {
  try {
    let user = await User.findOne({ email: req.body.email })
    if (!user) {
      res.send({ message: "user not exists!!" })
    }
    const secret = process.env.SECRETKEY + user.password;
    let token = await jwt.sign({ email: user.email, id: user._id }, secret, { expiresIn: '10m' })
    const link = `http://localhost:3000/resetpassword/${user._id}/${token}`
    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.G_MAIL,
        pass: process.env.G_MAIL_PASSWORD,
      }
    });
    let gmailId = await User.findOne({ email: req.body.email })
    var mailOptions = {
      from: process.env.G_MAIL,
      to: gmailId.email,
      subject: 'Reset password',
      text: link
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        res.send(error)
      } else {
        res.send({ message: "meil send" })
      }
    });
  } catch (error) {
    res.send(error);
  }
})

router.post("/resetpassword/:id/:token", async (req, res) => {
  const { id, token } = req.params;
  const { password } = { password: req.body.password };
  const oldUser = await User.findOne({ _id: id });
  if (!oldUser) {
    return res.json({ status: "User Not Exists!!" });
  }
  const secret = process.env.SECRETKEY + oldUser.password;
  try {
    const verify = jwt.verify(token, secret);
    const encryptedPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      {
        _id: id,
      },
      {
        $set: {
          password: encryptedPassword,
        },
      }
    );

    res.send({ email: verify.email, status: "verified" });
  } catch (error) {
    res.json({ status: "Something Went Wrong" });
  }
});

module.exports = router;
