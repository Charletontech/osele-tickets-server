const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const ExcelJS = require('exceljs');
const cors = require("cors");
const formidable = require('formidable');
const cloudinary = require('cloudinary').v2;
require("dotenv").config();
const mysql = require("mysql");
const axios = require("axios");
const ORM = require("./CharlieDB");

//middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());

//enabling cors
app.use(cors({
  origin: "https://oseletickets.netlify.app"
}))
app.options('*', cors())

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
  host: `${process.env.HOST}`,
  user: `${process.env.USER}`,
  password: `${process.env.PASSWORD}`,
  port: `${process.env.PORT}`,
  database: `${process.env.DATABASE}`,
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


app.get("/db-init", (req, res) => { console.log('object')
  var sql =
    "CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, regDate VARCHAR(15), fullName VARCHAR(255), phone VARCHAR(15), email VARCHAR(255), account VARCHAR(15), balance VARCHAR(255), dob VARCHAR(15), gender VARCHAR(15), type VARCHAR(15) )";
  connection.query(sql, (err, result) => {
    if (err) throw err;
    console.log(result);
  });

  sql = "CREATE TABLE IF NOT EXISTS events (id INT AUTO_INCREMENT PRIMARY KEY, eventName VARCHAR(255), eventCode  VARCHAR(255), organizer  VARCHAR(255), description  VARCHAR(255), date VARCHAR(255), location VARCHAR(255), noOfGuests VARCHAR(255), ticketPrices VARCHAR(255), starRating VARCHAR(255), flyer VARCHAR(255) )"
  connection.query(sql, (err, result) => {
    if (err) throw err;
    console.log(result);
  });
  
  
  sql = "CREATE TABLE IF NOT EXISTS postmyevent (id INT AUTO_INCREMENT PRIMARY KEY, eventName VARCHAR(255), organizer  VARCHAR(255), email  VARCHAR(255), noOfGuests  VARCHAR(255), date VARCHAR(255), venue VARCHAR(255), price VARCHAR(255), flyer VARCHAR(255))"
  connection.query(sql, (err, result) => {
    if (err) throw err;
    console.log(result);
  });

  sql = "CREATE TABLE IF NOT EXISTS ticketssold (id INT AUTO_INCREMENT PRIMARY KEY, eventCode VARCHAR(255), ticketId VARCHAR(255), qty VARCHAR(255), phone VARCHAR(255), eventName VARCHAR(255), price VARCHAR(255), datePurchased VARCHAR(255), flyer VARCHAR(255)) "
  connection.query(sql, (err, result) => {
    if (err) throw err;
    console.log(result);
  });
  console.log("Reached")
  res.status(200).json({message: "Database initialization completed"});
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


app.post("/login", (req, res) => {
  var { phone, password } = req.body; 
  var sql = ORM.select("*", "users");
  
  connection.query(sql, (err, result) => {
    if (err) throw err;
    var user = result.find((each) => {
      return each.phone == phone && each.dob == password;
    });

    if (user) {
      var sql = ORM.select("*", "ticketssold", "phone", user.phone);
      connection.query(sql, (err, result) => {
       res.status(200).json([user, result])
      });
    } else if (phone ==  `${process.env.ADMIN_PHONE}` && password == `${process.env.ADMIN_PASS}`) {
      res.status(200).json("Admin detected")
    } else {
      res.status(401).send('Failed');
    }
  });
});


app.post('/post-event-request', (req, res) => {
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      res.status(500).send('Internal Server Error (formidable)');
      return;
    }
    const {eventName,organizer, email,  noOfGuests, date, venue, price} = fields;
   console.log(files.flyer.filepath)
    try {
      const result = await cloudinary.uploader.upload(files.flyer.filepath, {
        fetch_format: 'auto',
        folder: 'cranshaw',
        quality: 'auto'
      });

      if (result) {
        var eventFlyerImageUrl = result.secure_url;
        var sql = ORM.insert("postmyevent", ['eventName','organizer', 'email',  'noOfGuests', 'date', 'venue', 'price', 'flyer'] )
        var values = [eventName,organizer, email,  noOfGuests, date, venue, price, eventFlyerImageUrl]
        connection.query(sql, values, (err, result) => {
          if (err){
            res.status(400).json('Database error')
            throw err
          };
          res.status(200).send('OK')
        });
      } else {
        res.status(400).json('An error ocurred while uploading event flyer')
      }

    } catch (error) {
      console.log("Error uploading file: ", error)
      res.status(400).json('An error ocurred while uploading event flyer')
    }
  })
})


app.post('/checkout', (req, res) => {
  let cart = req.body[0]
  let user = req.body[1].user;
  let total = req.body[2];
  console.log(cart[0].flyer)

  var sql = ORM.select('balance', 'users', 'phone', user)
  connection.query(sql, (err, result) => {
    if (err) throw err;
    var balance = parseFloat(result[0].balance)
    if (total > balance) {
      res.status(402).json('insufficient funds');
    } else {

     //debit balance
     balance = balance - total;
     var sql = ORM.update('users', 'balance', balance, user )
     connection.query(sql, (err, result) => {
        if (err) res.status(400).send('DB error')
        if (err) throw err;
        if (result) recordTransaction()
      })
      function recordTransaction() {
        var datePurchased =  
        new Date().getDate() +
        "/" +
        parseFloat(new Date().getMonth() + 1) +
        "/" +
        new Date().getFullYear();

        function ticketIdNo() {
          const min =  10000;
          const max = 99999;
          return Math.floor(Math.random() * (max - min + 1)) + min;
      }

        cart.forEach(({eventCode, eventName, price, qty, flyer }) => {
          var randomTicketNo = eventCode + ticketIdNo()
          var sql = ORM.insert('ticketssold', ['eventCode', 'ticketId', 'qty', 'phone', 'eventName', 'price', 'datePurchased', 'flyer'])
          var values = [eventCode, randomTicketNo, qty, user, eventName, price, datePurchased, flyer]
          connection.query(sql, values, (err, result) => {
            if (err) res.status(400).send('DB error')
            if (err) throw err;
            res.status(200).send('OK')
          })
        });
      }

    }
  });
})


// Admin routes
app.post('/create-event', (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      res.status(500).send('Internal Server Error (formidable)');
      return;
    }
    var {eventName, eventCode, organizer,description, date, location, noOfGuests, starRating, regular, vip, vvip, table } = fields;
    var ticketPrices = [{
      regular: regular,
      vip: vip,
      vvip: vvip,
      table: table
    }];
    ticketPrices = JSON.stringify(ticketPrices)

    const result = await cloudinary.uploader.upload(files.flyer.filepath, {
      fetch_format: 'auto',
      folder: 'cranshaw',
      quality: 'auto'
    });

    if (result) {
      var eventFlyerImageUrl = result.secure_url;
      var values = [eventName, eventCode, organizer,description, date, location, noOfGuests, starRating, ticketPrices, eventFlyerImageUrl]
      var sql = ORM.insert('events', ['eventName', 'eventCode', 'organizer','description', 'date', 'location', 'noOfGuests', 'starRating', 'ticketPrices', 'flyer'] )
      connection.query(sql, values, (err, result) => {
        if (err) throw err;
        if (result) res.status(200).send('OK');
      })   
    }
  })
})

app.get('/get-all-events', (req, res) => {
  var sql = ORM.select('*', 'events')
  connection.query(sql, (err, result) => {
    if (err) throw err;
    res.status(200).json(result)
  })
})

app.get('/get-all-customers', (req, res) => {
  var sql = ORM.select('*', 'users')
  connection.query(sql, (err, result) => {
    if (err) throw err;
    res.status(200).json(result)
  })
})

app.post('/debit-user', async (req, res) => {
  
  try {
    var {acctNo, user} =  req.body;
    var token = await getToken()
    getBalance(token, acctNo)
       async function getBalance (token, acctNo) {
      var response = await axios.get(`http://196.46.20.83:3021/clients/v1/accounts/${acctNo}/_balance`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      var balance = response.data.balance; 
      if (balance <= 0) {
        console.log('insuf');
        res.status(402).json('This user has no money in the account.')
        return
      }
      debitUser(token, acctNo, balance)
    }; 

      async function debitUser (token, acctNo, balance) {
      const payload = JSON.stringify({
        "account": acctNo, 
        "reference": "001",
        "amount": balance, 
        "description": "Debit for funding wallet - osele",
        "channel": "1"
      });

      var response = await axios.post('http://196.46.20.83:3021/clients/v1/transactions/_debit', payload);
      creditBalance(balance);
    };

    function creditBalance (balance)  {
      var sql = ORM.update('users', 'balance', `${balance}`, 'phone', `${user}`)
      connection.query(sql, (err, result) => {
        if (err) throw err;
        res.status(200).json('Admin credited and user balance updated successfully.')
      })
    };
    
  } catch (error) {
    console.log(error);
    res.status(400).json('error occurred while debiting user')
  }
})


app.get('/get-all-postmyevent-requests', async (req, res) => {
  var sql = ORM.select('*', 'postmyevent')
  connection.query(sql, (err, result) => {
    if (err) throw err;
    res.status(200).json(result)
  })
})


app.get('/get-all-tickets-sold', async (req, res) => {
  var sql = ORM.select('*', 'ticketssold')
  connection.query(sql, (err, result) => {
    if (err) res.status(400).json('DB error')
    if (err) throw err;
    res.status(200).json(result)
  })
})

app.post('/download-event-spreadsheet', async (req, res) => {
  var eventCode = req.body.eventCode;
  var sql = ORM.select('*', "ticketssold", "eventCode", eventCode )
  connection.query(sql, (err, result) => {
    if (err) res.status(400).json('DB error')
    if (err) throw err;
    generateCSV(result)
  })

  async function generateCSV(result) {
    try {
      // Create a new workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet 1');
     
    // Add header row
    const headerRow = Object.keys(result[0]);
    const boldHeaderRow = worksheet.addRow(headerRow);

    // Make header row bold
    boldHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
    });


    // Add data rows
    result.forEach((row) => {
      worksheet.addRow(Object.values(row));
    });

     // Write to file
     const filePath = path.join(__dirname, 'output.xlsx');
     await workbook.xlsx.writeFile(filePath);
 
     // Send the file to the client
     res.download(filePath, 'output.xlsx', (err) => {
       if (err) {
         console.error('Error sending file:', err);
         res.status(500).send('Error sending file');
       } else {
         console.log('File sent successfully');
         //delete file
         fs.unlink(filePath, (err) => {
          if (err) {
            console.error('Error deleting file:', err);
          } else {
            console.log('File deleted successfully');
          }
        });
       }
     });
    } catch (error) {
      res.status(500).send('Error sending file');
      console.log(error)
    }
  }
});


app.listen(3306, () => {
  console.log("MERN server (node) running on port 3306...");
});
