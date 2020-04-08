from flask import Flask
from flask import request
from flask import redirect, url_for, render_template
import shutil
import os
import string
import random
import DBConnector
import json
from dejavu import Dejavu
from dejavu.recognize import FileRecognizer, MicrophoneRecognizer
from fileinput import filename

app = Flask(__name__)
app.config.from_object(__name__)

UPLOAD_FOLDER = '/home/kiran/Documents/Symphonium-musicvisualization/Sheet Music Tanscriber/wav/'
ALLOWED_EXTENSIONS = set(['wav','pdf'])
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


def generate_random_name(extension):
    random_name = ''.join(random.SystemRandom().choice(
        string.ascii_lowercase + string.digits) for _ in range(8))
    return random_name + '.' + extension


def allowed_file(filename):
    print filename
    return '.' in filename and \
           filename.rsplit('.', 1)[1] in ALLOWED_EXTENSIONS


@app.route('/', methods=['GET'])
def home():
    return render_template('symphonium.html')
    

@app.route('/viz', methods=['GET'])
def viz():
    print "viz function"
    return render_template('viz.html')

@app.route('/3d', methods=['GET'])
def d3():
    print "3d function"
    return render_template('3d.html')


@app.route('/sheetmusic', methods=['GET','POST'])
def main():
    if request.method == 'POST':
        file = request.files['file']
        #print filename
        if file and allowed_file(file.filename):
            # filename = secure_filename(file.filename)
            
            filename = file.filename
            print filename
            DBConnector.insertEntryTODB(filename)
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            return render_template('main.html', filename=filename[:-4])
    else:
        return render_template('main.html')


@app.route('/sheetmusic/<filename>')
def display_sheet_notes(filename):
    print "filename %s" %filename
    pdfFile = DBConnector.fetchPdf(filename)
        #pdfFile.save(os.path.join(app.config['UPLOAD_FOLDER'], pdfFile))
    sourcePath = "/home/kiran/Documents/Symphonium-musicvisualization/Sheet Music Tanscriber/wav/%s" % (pdfFile)
    print "%s" % sourcePath 
    destPath = "/home/kiran/Documents/Symphonium-musicvisualization/Sheet Music Tanscriber/    /%s" % (pdfFile)
    print "%s" % destPath 
    shutil.move(sourcePath, destPath)
    return render_template('display_sheet_notes.html',
                           filename=pdfFile)

@app.route('/AFS')
def AFS():
    config = json.load(open("dejavu.cnf.SAMPLE"))
    # create a Dejavu instance
    djv = Dejavu(config)

    # Fingerprint all the mp3's in the directory we give it
    #djv.fingerprint_directory("mp3", [".mp3"])

    
    # Or recognize audio from your microphone for `secs` seconds
    secs = 5
    song = djv.recognize(MicrophoneRecognizer, seconds=secs)
    if song is None:
       failure = "Nothing recognized -- did you play the song out loud so your mic could hear it? (:"
       print failure
    else:
        print "From mic with %d seconds we recognized: %s\n" % (secs, song)

    print "No shortcut, we recognized: %s\n" % song
    
    return render_template('AFS.html',songDetails=song)

@app.route('/AFS_init')
def AFS_init():
    return render_template('AFS_init.html')


if __name__ == "__main__":
    app.run(host='localhost', port=8080, debug=True)
