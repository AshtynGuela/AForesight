import tempfile
import unittest
import uuid
from pathlib import Path
from app import create_app

class AssistantTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).resolve().parents[1]/'instance'/'tests'
        root.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root)
        self.client=create_app(Path(self.tmp.name)/'test.sqlite3').test_client()
        self.session=str(uuid.uuid4())
    def tearDown(self):self.tmp.cleanup()
    def chat(self,text):
        response=self.client.post('/api/chat',json={'session':self.session,'message':text,'confirmation_id':getattr(self,'confirmation',None)})
        if response.json.get('confirmation_id'):self.confirmation=response.json['confirmation_id']
        return response
    def test_crop_requires_confirmation(self):
        self.assertEqual(self.chat('my crop is corn').json['target_field'],'crop')
        self.assertEqual(self.client.get('/api/state').json['farm']['crop'],'rice')
        saved=self.chat('Save this').json
        self.assertTrue(saved['changed'])
        self.assertEqual(saved['updated_fields'],{'crop':'corn'})
        self.assertEqual(self.client.get('/api/state').json['farm']['crop'],'corn')
    def test_cancel(self):
        self.chat('newly planted');self.chat('Cancel');self.chat('Save this')
        self.assertEqual(self.client.get('/api/state').json['farm']['crop_stage'],'unknown')
    def test_note_retry_does_not_duplicate(self):
        self.chat('Save a note');r=self.chat('Watered the field today')
        self.assertIn('Save this',r.json['choices'])
        self.chat('Save this');self.chat('Save this')
        self.assertEqual(len(self.client.get('/api/state').json['journals']),1)
    def test_drainage_conversation(self):
        self.assertIn('Drains well',self.chat('Choose a crop').json['choices'])
        self.assertIn('sources',self.chat('Drains well').json)
    def test_simulation_removed(self):
        self.assertEqual(self.client.post('/api/simulate',json={}).status_code,404)
    def test_invalid_session(self):
        self.assertEqual(self.client.post('/api/chat',json={'session':'x','message':'hello'}).status_code,400)

    def test_wrong_confirmation_cannot_write(self):
        self.chat('my crop is corn')
        self.confirmation='wrong'
        self.chat('Save this')
        self.assertEqual(self.client.get('/api/state').json['farm']['crop'],'rice')
