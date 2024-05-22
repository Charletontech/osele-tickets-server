const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
require("dotenv").config();
const mysql = require("mysql");
const ORM = require("./CharlieDB");

//middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

// Enable CORS with specific options
app.use(
  cors({
    origin: "http://localhost:3000", // Allow requests from a specific origin
    methods: ["GET", "POST"], // Allow specific HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allow specific headers
  })
);

//check every request header for authorization token
app.use((req, res, next) => {
  if (req.headers.authorization) {
    var token;
    req.headers.authorization.startsWith("Bearer")
      ? (token = req.headers.authorization.split(" ")[1])
      : (token = req.headers.authorization);
    if (token == 123) {
      console.log("token correct", token);
      next();
    } else {
      res.status(401).json({ error: "Unauthorized access!" });
    }
  } else {
    res.status(401).json({ error: "Access token absent!" });
  }
});


// Cloudinary configuration
cloudinary.config({
  cloud_name: `${process.env.CLOUD_NAME}`,
  api_key: `${process.env.API_KEY}`,
  api_secret: `${process.env.API_SECRET}`,
});


const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  port: 3306,
  database: "osele",
});




//logic to generate logon token
const getToken = async () => {
  try {
    const payLoad = {
      clientKey: process.env.CLIENT_KEY,
      clientSecret: process.env.CLIENT_SECRET,
      clientId: process.env.CLIENT_ID,
      rememberMe: true,
    };
    var response = await axios.post('http://196.46.20.83:3021/clients/v1/auth/_login', payLoad)
    var token = response.data.token
    return token
  } catch (error) {
    console.log(error);
  }
}


app.get("/db-init", (req, res) => {
  var sql =
    "CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, regDate VARCHAR(15), fullName VARCHAR(255), phone VARCHAR(15), email VARCHAR(255), account VARCHAR(15), balance VARCHAR(255), dob VARCHAR(15), gender VARCHAR(15), type VARCHAR(15) )";
  connection.query(sql, (err, result) => {
    if (err) throw err;
    console.log(result);
  });

  res.send("Database initialization completed");
})


app.post("/signup", async (req, res) => {
  const {fName, phone, email, dob, gender, type} = req.body;

  //split full name
  var [firstN, middleN, lastN] = [...fName.split(" ")];
  //logic to convert date to required format
   var convertedDate = new Date(dob).toISOString();

  
  //logic to check if user already exists
  checkUser();
  function checkUser() {
    var sql = ORM.select("*", "users", "phone", `${phone}`);
    connection.query(sql, (err, result) => {
      if (err) throw err;
      if (result.length == 0) {
        generateToken();
      } else {
        res.send("User already exist! Please log in.");
      }
    });
  }


  //generate token for wallet creation
  const generateToken = async () => {
    var token = await getToken()
    generateWalletAccount(token);
  };

  async function generateWalletAccount(token) {
    try {
      var payLoad = {
        phoneNumber: phone,
        firstName: firstN,
        lastName: lastN,
        middleName: middleN,
        gender: gender,
        dateOfBirth: convertedDate,
        productCode: "214",
        email: email,
        type: 1,
      };

      var response = await axios.post(
        "http://196.46.20.83:3021/clients/v1/accounts",
        payLoad,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.data.account) {
        addUserToDatabase(response.data.account);
        console.log(response.data);
      } 
 
    } catch (err) {
      if (err) {
        res.sendStatus = 500;
        return
      }
      console.error(err);
    }
  }

  addUserToDatabase(walletNo)
  //logic to add user to DB
  async function addUserToDatabase(walletNo) {
    //get current date
    var date =
      new Date().getDate() +
      "/" +
      parseFloat(new Date().getMonth() + 1) +
      "/" +
      new Date().getFullYear();
    var sql = ORM.insert("users", [
      "regDate",
      "fullName",
      "phone",
      "email",
      "account",
      "balance",
      "dob",
      "gender",
      "type"
    ]);
    var value = [
      date,
      fName,
      phone,
      email,
      walletNo,
      "0.00",
      dob,
      gender,
      type
    ];
    connection.query(sql, value, (err, result) => {
      if (err) throw err;
      res.status(200).send('OK')
    });
  }

});

app.post('/post-event-request', (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      res.status(500).send('Internal Server Error (formidable)');
      return;
    }
    // const {owner, eventName, noOfGuests, date, price} = fields;
    // try {
    //   const result = await cloudinary.uploader.upload(files.productImage.filepath, {
    //     fetch_format: 'auto',
    //     folder: 'cranshaw',
    //     quality: 'auto'
    //   });
    //   var eventFlyerImageUrl = result.secure_url;
    // } catch (error) {
    //   console.log("Error uploading file: ", error)
    // }
    console.log(files.flyer.filepath)
    res.sendStatus(200);
  })
})


app.post("/login", (req, res) => {
  var { phone, password } = req.body; 
  var sql = ORM.select("*", "users");
  
  connection.query(sql, (err, result) => {
    if (err) throw err;
    var user = result.find((each) => {
      return each.phone == phone && each.dob == password;
    });

    if (user) {
      //var sql = ORM.select("*", "transactions", "user", user.phone);
      //connection.query(sql, (err, result) => {
       // res.render("dashboard", { user, result });
      //});
      res.status(200).json(user)
    } else if (phone ==  `${process.env.ADMIN_PHONE}` && password == `${process.env.ADMIN_PASS}`) {
      res.redirect('/admin')
    } else {
      res.status(401).send('Failed');
    }
  });
});

app.post('/checkout', (req, res) => {
  let cart = req.body[0]
  let user = req.body[1].user;
  let total = req.body[2];

  var sql = ORM.select('balance', 'users', 'phone', user)
  connection.query(sql, (err, result) => {
    if (err) throw err;
    if (30000 > parseFloat(result[0].balance)) {
      res.status(402).json('insufficient funds');
    } else {
      console.log('amount ok')
      res.status(200).send('OK')
    }
  });
})









app.post("/test", (req, res) => {
  // var token = req.headers['authorization']
  // if (!authToken(token)) {
  //     res.send('forbidden')
  //     return
  // }
  // console.log('Reached!');
  console.log(req.body);
  res.status(200).json("Response is ok");
});

app.listen(5000, () => {
  console.log("MERN server (node) running on port 5000...");
});
