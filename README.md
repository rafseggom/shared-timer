# shared-timer

Super simple (and **cloud ready**) shared timer using websockets (thanks to [socket.io](https://socket.io)).

## Features

- Real-time synchronized countdown timer
- Admin interface for controlling the timer
- Session-based access keys
- **Professor authentication with absolute permissions**
- Visual indicators when a professor is controlling the timer
- Mobile-friendly interface

## Installation

```bash
git clone https://github.com/pafmon/shared-timer.git
cd shared-timer
npm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and configure your settings:

```env
# Server port
PORT=5000

# Master key (absolute access from environment variable)
MASTERKEY=supersecret

# Professor passwords
# Format: username:password:Full Name,username2:password2:Full Name 2
PROF_PASSWORDS=pablo:MiClave123:Pablo Fernandez,carlos:OtraClave456:Carlos Muller
```

### Professor Passwords Format

Configure your professors in the `PROF_PASSWORDS` environment variable using this format:

```
username:password:Full Name,username2:password2:Full Name 2
```

**Example:**
```
PROF_PASSWORDS=pablo:SecurePass123:Pablo Fernandez,carlos:AnotherPass456:Carlos Muller
```

- **username**: Identifier for the professor (not shown in UI)
- **password**: Secret password only the professor knows
- **Full Name**: Display name shown in banners and badges

⚠️ **Security**: Use strong passwords and keep them secret. Never commit the `.env` file to git.

## Starting the Server

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

If `$PORT` is not set, by default it launches a server on port 5000.

## Usage

- **Main timer view**: `http://localhost:5000`
- **Admin interface**: `http://localhost:5000/admin` (password: `admin123`)

### Access Hierarchy

The application has multiple levels of access control with the following priority:

1. 🏆 **Professor Password** (highest priority)
   - Configured in `PROF_PASSWORDS` environment variable
   - Absolute control over timer
   - Bypasses all other access keys
   - Cannot be changed by other users
   - Visible banner shows which professor is in control

2. 🔑 **Master Key**
   - Configured in `MASTERKEY` environment variable (default: `supersecret`)
   - Absolute control over timer
   - Can clear session keys
   - Only you know this key

3. 🔐 **Session Key**
   - Temporary shared key set by users
   - Resets automatically when all users disconnect
   - Can be changed by anyone who knows the current session key

4. 🚪 **Admin Password**
   - Hardcoded as `admin123`
   - Only grants access to the admin interface
   - Does NOT grant timer control (requires master/session key)

### Professor Login

1. Navigate to `/admin`
2. Enter the admin password (`admin123`)
3. Click "🎓 Login Profesor"
4. Enter your professor password
5. Once logged in:
   - A badge will show "🔑 PROFESOR - [Your Name]"
   - All users will see a banner: "🎓 Timer controlado por Profesor [Your Name]"
   - You can control the timer without entering any keys
   - The "Security Key" panel will be hidden (you don't need it)

## Deployment on Koyeb

1. Create a new service on Koyeb
2. Connect your GitHub repository
3. Set the environment variables in Koyeb dashboard:
   - `PORT` (optional, defaults to 5000)
   - `MASTERKEY` (your secret master password)
   - `PROF_PASSWORDS` (your professors' credentials)
4. Deploy!

⚠️ **Important**: Make sure to set strong passwords in production and never expose them publicly.

## Docker Support

The included `Dockerfile` can be used to containerize the application:

```bash
docker build -t shared-timer .
docker run -p 5000:5000 -e MASTERKEY=your-secret -e PROF_PASSWORDS="..." shared-timer
```

## Development

- The project uses `nodemon` for development with hot-reload
- Edit files and the server will restart automatically
- Logs are displayed in the console

## Original Author

- [@pafmon](https://github.com/pafmon)
- Fork by [@rafseggom](https://github.com/rafseggom)

## License

ISC

