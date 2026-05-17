#!/usr/bin/env python3
"""
Persistent Data Storage Server for IELTS Check Application
Stores problems, test results, schedules to JSON files, and audio files
"""

import json
import os
import threading
import urllib.parse
import base64
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime
from pathlib import Path


# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
STORAGE_PORT = int(os.getenv("STORAGE_PORT", "8788"))
STORAGE_HOST = os.getenv("STORAGE_HOST", "127.0.0.1")

# Storage file paths
PROBLEMS_FILE = os.path.join(DATA_DIR, "problems.json")
DAILY_TESTS_FILE = os.path.join(DATA_DIR, "daily_tests.json")
TEST_RESULTS_FILE = os.path.join(DATA_DIR, "test_results.json")

# Lock for thread-safe file operations
file_lock = threading.RLock()


def ensure_data_dir():
    """Create data directory and audio subdirectory if they don't exist"""
    Path(DATA_DIR).mkdir(exist_ok=True)
    Path(AUDIO_DIR).mkdir(exist_ok=True)


def read_json_file(filepath, default=None):
    """Read JSON file with fallback to default value"""
    if default is None:
        default = {}
    
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading {filepath}: {e}")
    
    return default


def write_json_file(filepath, data):
    """Write JSON file atomically"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"Error writing {filepath}: {e}")
        return False


def get_all_problems():
    """Get all problems organized by module"""
    with file_lock:
        data = read_json_file(PROBLEMS_FILE, {})
        # Ensure all modules exist
        for module in ['reading', 'listening', 'writing', 'speaking']:
            if module not in data:
                data[module] = []
        return data


def save_problems(problems_dict):
    """Save all problems to file"""
    with file_lock:
        return write_json_file(PROBLEMS_FILE, problems_dict)


def add_problem(module, problem_data):
    """Add a single problem to a module"""
    with file_lock:
        problems = get_all_problems()
        if module not in problems:
            problems[module] = []
        
        # Assign ID if not present
        if 'id' not in problem_data:
            problem_data['id'] = len(problems[module]) + 1
        
        problems[module].append(problem_data)
        save_problems(problems)
        return problem_data


def delete_problem(module, problem_id):
    """Delete a specific problem"""
    with file_lock:
        problems = get_all_problems()
        if module in problems:
            problems[module] = [p for p in problems[module] if p.get('id') != problem_id]
            save_problems(problems)
            return True
        return False


def update_problem(module, problem_id, updated_data):
    """Update a specific problem"""
    with file_lock:
        problems = get_all_problems()
        if module in problems:
            for i, p in enumerate(problems[module]):
                if p.get('id') == problem_id:
                    problems[module][i] = updated_data
                    save_problems(problems)
                    return True
        return False


def get_daily_tests():
    """Get all daily test records"""
    with file_lock:
        return read_json_file(DAILY_TESTS_FILE, {})


def save_daily_tests(data):
    """Save daily test records"""
    with file_lock:
        return write_json_file(DAILY_TESTS_FILE, data)


def record_daily_test(module, date, completed=True):
    """Record that a test was completed on a specific date"""
    with file_lock:
        daily = get_daily_tests()
        if date not in daily:
            daily[date] = {}
        daily[date][module] = completed
        save_daily_tests(daily)


def get_test_results():
    """Get all test results"""
    with file_lock:
        return read_json_file(TEST_RESULTS_FILE, [])


def save_test_result(result_data):
    """Save a test result"""
    with file_lock:
        results = get_test_results()
        result_data['timestamp'] = datetime.now().isoformat()
        results.append(result_data)
        write_json_file(TEST_RESULTS_FILE, results)
        return result_data


def get_audio_file_path(set_id, part_id=1):
    """Get the file path for audio storage"""
    return os.path.join(AUDIO_DIR, f"{set_id}_part{part_id}.mp3")


def save_audio_file(set_id, part_id, audio_data):
    """Save audio file from base64-encoded data"""
    try:
        file_path = get_audio_file_path(set_id, part_id)
        # If audio_data is base64-encoded, decode it
        if isinstance(audio_data, str):
            try:
                # Try to decode as base64
                audio_bytes = base64.b64decode(audio_data)
            except:
                # If not base64, treat as binary string
                audio_bytes = audio_data.encode('latin1')
        else:
            audio_bytes = audio_data
        
        with open(file_path, 'wb') as f:
            f.write(audio_bytes)
        return True
    except Exception as e:
        print(f"Error saving audio file: {e}")
        return False


def load_audio_file(set_id, part_id=1):
    """Load audio file and return as binary"""
    try:
        file_path = get_audio_file_path(set_id, part_id)
        if os.path.exists(file_path):
            with open(file_path, 'rb') as f:
                return f.read()
    except Exception as e:
        print(f"Error loading audio file: {e}")
    return None


def delete_audio_file(set_id, part_id=1):
    """Delete audio file"""
    try:
        file_path = get_audio_file_path(set_id, part_id)
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
    except Exception as e:
        print(f"Error deleting audio file: {e}")
    return False


class StorageHandler(BaseHTTPRequestHandler):
    """HTTP request handler for data storage operations"""
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()
    
    def _set_cors_headers(self):
        """Set CORS headers for all responses"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
    
    def do_GET(self):
        """Handle GET requests"""
        try:
            if self.path == '/api/problems':
                # Get all problems
                problems = get_all_problems()
                self._send(200, problems)
            
            elif self.path.startswith('/api/problems/'):
                # Get problems for specific module
                module = self.path.split('/')[-1]
                problems = get_all_problems()
                data = problems.get(module, [])
                self._send(200, data)
            
            elif self.path == '/api/daily-tests':
                # Get all daily test records
                daily = get_daily_tests()
                self._send(200, daily)
            
            elif self.path == '/api/test-results':
                # Get all test results
                results = get_test_results()
                self._send(200, results)
            
            elif self.path.startswith('/api/audio/download/'):
                # Download audio file
                # Format: /api/audio/download/{setId}/{partId}
                parts = self.path.split('/')
                if len(parts) >= 5:
                    set_id = urllib.parse.unquote(parts[4])
                    part_id = int(parts[5]) if len(parts) > 5 else 1
                    
                    audio_data = load_audio_file(set_id, part_id)
                    if audio_data:
                        self.send_response(200)
                        self.send_header('Content-Type', 'audio/mpeg')
                        self.send_header('Content-Length', str(len(audio_data)))
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(audio_data)
                    else:
                        self._send(404, {"error": "Audio file not found"})
                else:
                    self._send(400, {"error": "Invalid audio download path"})
            
            else:
                self._send(404, {"error": "Not found"})
        
        except Exception as e:
            self._send(500, {"error": str(e)})
    
    def do_POST(self):
        """Handle POST requests"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body) if body else {}
            
            action = payload.get('action', '')
            
            if action == 'save-problem':
                # Save a single problem
                module = payload.get('module')
                problem = payload.get('problem', {})
                
                if not module:
                    self._send(400, {"error": "Module required"})
                    return
                
                result = add_problem(module, problem)
                self._send(200, {"success": True, "problem": result})
            
            elif action == 'save-all-problems':
                # Save all problems (bulk)
                problems = payload.get('problems', {})
                success = save_problems(problems)
                self._send(200, {"success": success})
            
            elif action == 'record-daily-test':
                # Record daily test completion
                module = payload.get('module')
                date = payload.get('date')
                completed = payload.get('completed', True)
                
                if not module or not date:
                    self._send(400, {"error": "Module and date required"})
                    return
                
                record_daily_test(module, date, completed)
                self._send(200, {"success": True})
            
            elif action == 'save-test-result':
                # Save test result
                result = payload.get('result', {})
                saved = save_test_result(result)
                self._send(200, {"success": True, "result": saved})
            
            elif action == 'save-audio':
                # Save audio file from base64 data
                set_id = payload.get('setId')
                part_id = payload.get('partId', 1)
                audio_data = payload.get('audioData')  # base64-encoded
                
                if not set_id or not audio_data:
                    self._send(400, {"error": "setId and audioData required"})
                    return
                
                success = save_audio_file(set_id, part_id, audio_data)
                if success:
                    self._send(200, {"success": True, "message": "Audio saved"})
                else:
                    self._send(500, {"error": "Failed to save audio"})
            
            else:
                self._send(400, {"error": "Unknown action"})
        
        except Exception as e:
            self._send(500, {"error": str(e)})
    
    def do_PUT(self):
        """Handle PUT requests"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body) if body else {}
            
            module = payload.get('module')
            problem_id = payload.get('id')
            updated_data = payload.get('data', {})
            
            if not module or problem_id is None:
                self._send(400, {"error": "Module and ID required"})
                return
            
            success = update_problem(module, problem_id, updated_data)
            self._send(200, {"success": success})
        
        except Exception as e:
            self._send(500, {"error": str(e)})
    
    def do_DELETE(self):
        """Handle DELETE requests"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body) if body else {}
            
            module = payload.get('module')
            problem_id = payload.get('id')
            
            if not module or problem_id is None:
                self._send(400, {"error": "Module and ID required"})
                return
            
            success = delete_problem(module, problem_id)
            self._send(200, {"success": success})
        
        except Exception as e:
            self._send(500, {"error": str(e)})
    
    def _send(self, status_code, data):
        """Send JSON response"""
        self.send_response(status_code)
        self._set_cors_headers()
        self.end_headers()
        response = json.dumps(data, ensure_ascii=False)
        self.wfile.write(response.encode('utf-8'))
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass


def start_server():
    """Start the storage server"""
    ensure_data_dir()
    
    server_address = (STORAGE_HOST, STORAGE_PORT)
    httpd = HTTPServer(server_address, StorageHandler)
    
    print(f"🗄️  Data Storage Server started at http://{STORAGE_HOST}:{STORAGE_PORT}")
    print(f"📁 Data directory: {DATA_DIR}")
    print("Press Ctrl+C to stop...")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
        httpd.server_close()


if __name__ == '__main__':
    start_server()
