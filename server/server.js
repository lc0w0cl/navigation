import express from 'express';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import * as fs from "fs";
import path from "node:path";
import multer from 'multer';
import axios from "axios";

const app = express();
const port = 3000;


// 设置默认环境为 'development'
const isDev = process.env.NODE_ENV !== 'production';
const dbDir = isDev ? './' : '/app/db'; // 使用项目根目录
const uploadDir = isDev ? '../src/assets/logo' : '/app/logo'
console.log('当前环境:', isDev ? 'dev' : 'prod')
// 确保数据库目录存在
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, {recursive: true});
    console.log('目录创建成功');
}


// 设置 multer 存储配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir); // 上传文件的目标目录
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, uniqueSuffix + extension); // 使用随机文件名
    }
});

const upload = multer({storage: storage});

// 文件上传接口
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send({error: 'No file uploaded'});
    }
    let filepath;
    if (isDev) {
        filepath = '/src/assets/logo/' + req.file.filename
    } else {
        filepath = '/logo/' + req.file.filename
    }
    res.send({message: '文件上传成功', filepath: filepath});
});


app.get('/api/fetch-logo', async (req, res) => {
    const { url } = req.query;
    try {
        // 确保只传递域名部分
        const domain = new URL(url).hostname;
        const logoUrl = `https://logo.clearbit.com/${domain}`;

        const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
        const logoPath = path.join(uploadDir, `${domain}.png`);

        fs.writeFileSync(logoPath, logoResponse.data);
        const filepath = isDev ? `/src/assets/logo/${domain}.png` : `/logo/${domain}.png`;
        res.json({ message: '文件保存成功', path: filepath });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: '抓取logo失败' });
    }
});

app.delete('/api/delete-logo', (req, res) => {
    const {filename} = req.query;
    let fullPath;
    if (isDev) {
        fullPath = path.join('..', 'src', 'assets', 'logo', path.basename(filename));
    } else {
        fullPath = path.join('app', 'logo', path.basename(filename))
    }

    fs.unlink(fullPath, (err) => {
        if (err) {
            console.error('删除文件失败:', err);
            return res.status(500).json({error: '删除文件失败'});
        }
        res.json({message: '文件删除成功'});
    });
});

// 打开数据库连接
let db = new sqlite3.Database(path.join(dbDir, 'shortcuts.db'), (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the shortcuts database.');
})

// 创建表并插入默认用户和数据
db.serialize(() => {
    // 创建 shortcuts 表
    db.run(`CREATE TABLE IF NOT EXISTS shortcuts
            (
                id
                INTEGER
                PRIMARY
                KEY
                AUTOINCREMENT,
                groupName
                TEXT,
                orderNum
                INTEGER,
                title
                TEXT,
                icon
                TEXT,
                internalNetwork
                TEXT,
                privateNetwork
                TEXT
            )`, (err) => {
        if (err) {
            console.error("Error creating shortcuts table:", err.message);
        } else {
            console.log("Shortcuts table created successfully.");

            // 检查 shortcuts 表中是否有数据
            db.get(`SELECT COUNT(*) AS count
                    FROM shortcuts`, (err, row) => {
                if (err) {
                    console.error("Error checking shortcuts table:", err.message);
                } else if (row.count === 0) {
                    // 如果没有数据，插入默认数据
                    const insert = `INSERT INTO shortcuts (groupName, orderNum, title, icon, internalNetwork, privateNetwork)
                                    VALUES (?, ?, ?, ?, ?, ?)`;
                    db.run(insert, ['私人应用', 1, '百度', '/logo/百度.svg', 'https://www.baidu.com', 'private-network'], (err) => {
                        if (err) {
                            console.error("Error inserting default shortcut:", err.message);
                        } else {
                            console.log("Default shortcut inserted successfully.");
                        }
                    });
                }
            });
        }
    });

    // 创建 users 表
    db.run(`CREATE TABLE IF NOT EXISTS users
            (
                id
                INTEGER
                PRIMARY
                KEY
                AUTOINCREMENT,
                username
                TEXT
                UNIQUE,
                password
                TEXT
            )`, (err) => {
        if (err) {
            console.error("Error creating users table:", err.message);
        } else {
            console.log("Users table created successfully.");

            // 插入默认的 root 用户
            const insert = `INSERT INTO users (username, password)
                            VALUES (?, ?)`;
            db.run(insert, ['root', '$2b$10$J/FTCcGrCeUL2ryvKEDWseHuS40emqWMHzIg5tJGqYa4rlKCM5pri'], (err) => {
                if (err) {
                    console.error("Error inserting default user:", err.message);
                } else {
                    console.log("Default root user inserted successfully.");
                }
            });
        }
    });
});

// 解析 JSON 请求体
app.use(express.json());

// 定义 API 路由
app.get('/api/shortcuts', (req, res) => {
    const sql = `SELECT *
                 FROM shortcuts`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// 新增快捷方式
app.post('/api/shortcuts', (req, res) => {
    const {groupName, orderNum, title, icon, internalNetwork, privateNetwork} = req.body;
    const sql = `INSERT INTO shortcuts (groupName, orderNum, title, icon, internalNetwork, privateNetwork)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const params = [groupName, orderNum, title, icon, internalNetwork, privateNetwork];

    db.run(sql, params, function (err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        res.json({
            "message": "success",
            "data": {id: this.lastID}
        });
    });
});

// 更新快捷方式
app.put('/api/shortcuts/:id', (req, res) => {
    const {title, icon, internalNetwork, privateNetwork} = req.body;
    const {id} = req.params;
    console.log(`Updating shortcut with ID: ${id}`); // 打印 ID
    console.log(`Received data:`, req.body); // 打印接收到的数据

    const sql = `UPDATE shortcuts
                 SET title           = ?,
                     icon            = ?,
                     internalNetwork = ?,
                     privateNetwork  = ?
                 WHERE id = ?`;
    const params = [title, icon, internalNetwork, privateNetwork, id];

    db.run(sql, params, function (err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        console.log(`Changes made: ${this.changes}`); // 打印更新的行数
        res.json({
            "message": "success",
            "changes": this.changes
        });
    });
});

// 更新特定组内的快捷方式
app.put('/api/shortcuts/group/:groupName', (req, res) => {
    const {groupName} = req.params;
    const shortcuts = req.body.shortcuts;

    // 为每个快捷方式构建更新语句
    shortcuts.forEach((shortcut, index) => {
        const sql = `UPDATE shortcuts
                     SET orderNum = ?
                     WHERE id = ?
                       AND groupName = ?`;
        const params = [shortcut.orderNum, shortcut.id, groupName];

        db.run(sql, params, function (err) {
            if (err) {
                console.error(`更新失败: ${err.message}`);
                res.status(400).json({"error": err.message});
                return;
            }
        });
    });

    // 响应客户端
    res.json({
        "message": "快捷方式更新成功",
        "groupName": groupName
    });
});

// 删除快捷方式
app.delete('/api/shortcuts/:id', (req, res) => {
    const {id} = req.params;
    const sql = `DELETE
                 FROM shortcuts
                 WHERE id = ?`;

    db.run(sql, id, function (err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        console.log(`Deleted shortcut with ID: ${id}`); // 打印删除的快捷方式 ID
        res.json({
            "message": "success",
            "changes": this.changes  // 返回被删除的行数
        });
    });
});

// 注册新用户
app.post('/api/register', async (req, res) => {
    const {username, password} = req.body;
    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.run(sql, [username, hashedPassword], function (err) {
            if (err) {
                return res.status(400).send({error: err.message});
            }
            res.send({message: 'User registered', id: this.lastID});
        });
    } catch (error) {
        res.status(500).send({error: error.message});
    }
})

// 用户登录
app.post('/api/login', (req, res) => {
    const {username, password} = req.body;
    const sql = 'SELECT password FROM users WHERE username = ?';

    db.get(sql, [username], async (err, row) => {
        if (err) {
            return res.status(400).send({error: err.message});
        }
        if (row) {
            const match = await bcrypt.compare(password, row.password);
            if (match) {
                res.send({message: 'Login successful'});
            } else {
                res.send({message: 'Login failed'});
            }
        } else {
            res.status(404).send({message: 'User not found'});
        }
    });
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
