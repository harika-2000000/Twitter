const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");

const app = express();
const db = new sqlite3.Database("./twitterClone.db");
const secretKey = "your-secret-key"; // Replace with your secret key for JWT

// Middleware to verify JWT token
function verifyToken(req, res, next) {
  const token = req.headers["authorization"];

  if (!token) {
    res.status(401).send("Invalid JWT Token");
  } else {
    // Extract the token part (remove "Bearer " from the header)
    const tokenPart = token.split(" ")[1];

    jwt.verify(tokenPart, secretKey, (err, decoded) => {
      if (err) {
        res.status(401).send("Invalid JWT Token");
      } else {
        req.userId = decoded.userId;
        next();
      }
    });
  }
}

app.use(express.json());

app.post("/register/", (req, res) => {
  const { username, password, name, gender } = req.body;
  if (!username || !password || !name || !gender) {
    res.status(400).send("Incomplete data");
    return;
  }

  db.get("SELECT * FROM user WHERE username = ?", [username], (err, row) => {
    if (err) {
      res.status(500).send("Internal Server Error");
    } else if (row) {
      res.status(400).send("User already exists");
    } else if (password.length < 6) {
      res.status(400).send("Password is too short");
    } else {
      db.run(
        "INSERT INTO user (username, password, name, gender) VALUES (?, ?, ?, ?)",
        [username, password, name, gender],
        function (err) {
          if (err) {
            res.status(500).send("Internal Server Error");
          } else {
            res.status(200).send("User created successfully");
          }
        }
      );
    }
  });
});

app.post("/login/", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).send("Incomplete data");
    return;
  }

  db.get(
    "SELECT * FROM user WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else if (!row) {
        res.status(400).send("Invalid user");
      } else {
        const token = jwt.sign({ userId: row.user_id }, secretKey);
        res.status(200).json({ jwtToken: token });
      }
    }
  );
});

app.use(verifyToken);

app.get("/user/tweets/feed/", (req, res) => {
  const userId = req.userId;
  db.all(
    `SELECT * FROM tweet WHERE user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ?) ORDER BY date_time DESC LIMIT 4`,
    [userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else {
        res.status(200).json(rows);
      }
    }
  );
});

app.get("/user/following/", (req, res) => {
  const userId = req.userId;
  db.all(
    `SELECT name FROM user WHERE user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ?)`,
    [userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else {
        res.status(200).json(rows);
      }
    }
  );
});

app.get("/user/followers/", (req, res) => {
  const userId = req.userId;
  db.all(
    `SELECT name FROM user WHERE user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id = ?)`,
    [userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else {
        res.status(200).json(rows);
      }
    }
  );
});

app.get("/tweets/:tweetId/", (req, res) => {
  const { tweetId } = req.params;
  const userId = req.userId;
  db.get(
    `SELECT tweet, (SELECT COUNT(*) FROM like WHERE tweet_id = ?) as likes, 
    (SELECT COUNT(*) FROM reply WHERE tweet_id = ?) as replies, date_time 
    FROM tweet WHERE tweet_id = ? AND user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ?)`,
    [tweetId, tweetId, tweetId, userId],
    (err, row) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else if (!row) {
        res.status(401).send("Invalid Request");
      } else {
        res.status(200).json(row);
      }
    }
  );
});

app.get("/tweets/:tweetId/likes/", (req, res) => {
  const { tweetId } = req.params;
  const userId = req.userId;
  db.all(
    `SELECT username FROM user WHERE user_id IN (SELECT user_id FROM like WHERE tweet_id = ?) AND user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ?)`,
    [tweetId, userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else if (!rows) {
        res.status(401).send("Invalid Request");
      } else {
        res.status(200).json({ likes: rows.map((row) => row.username) });
      }
    }
  );
});

app.get("/tweets/:tweetId/replies/", (req, res) => {
  const { tweetId } = req.params;
  const userId = req.userId;
  db.all(
    `SELECT user.name, reply FROM reply INNER JOIN user ON user.user_id = reply.user_id WHERE tweet_id = ? AND reply.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ?)`,
    [tweetId, userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else if (!rows) {
        res.status(401).send("Invalid Request");
      } else {
        res.status(200).json({ replies: rows });
      }
    }
  );
});

app.get("/user/tweets/", (req, res) => {
  const userId = req.userId;
  db.all(
    "SELECT tweet, (SELECT COUNT(*) FROM like WHERE tweet_id = tweet.tweet_id) as likes, (SELECT COUNT(*) FROM reply WHERE tweet_id = tweet.tweet_id) as replies, date_time FROM tweet WHERE user_id = ?",
    [userId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else {
        res.status(200).json(rows);
      }
    }
  );
});

app.post("/user/tweets/", (req, res) => {
  const { tweet } = req.body;
  const userId = req.userId;
  if (!tweet) {
    res.status(400).send("Incomplete data");
    return;
  }

  db.run(
    "INSERT INTO tweet (tweet, user_id, date_time) VALUES (?, ?, datetime('now', 'localtime'))",
    [tweet, userId],
    function (err) {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else {
        res.status(200).send("Created a Tweet");
      }
    }
  );
});

app.delete("/tweets/:tweetId/", (req, res) => {
  const { tweetId } = req.params;
  const userId = req.userId;
  db.get(
    "SELECT * FROM tweet WHERE tweet_id = ? AND user_id = ?",
    [tweetId, userId],
    (err, row) => {
      if (err) {
        res.status(500).send("Internal Server Error");
      } else if (!row) {
        res.status(401).send("Invalid Request");
      } else {
        db.run(
          "DELETE FROM tweet WHERE tweet_id = ?",
          [tweetId],
          function (err) {
            if (err) {
              res.status(500).send("Internal Server Error");
            } else {
              res.status(200).send("Tweet Removed");
            }
          }
        );
      }
    }
  );
});

module.exports = app;
