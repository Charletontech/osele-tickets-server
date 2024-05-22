require('dotenv').config();


const authToken = (token) => {
    if (token === process.env.TOKEN) {
        return true
    } else {
        return false
    }
}

module.exports= authToken