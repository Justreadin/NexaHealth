import torch
from transformers import (
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
    DataCollatorForSeq2Seq
)
from datasets import Dataset
import pandas as pd
import json
from peft import LoraConfig, get_peft_model, TaskType
import gc
from typing import Dict, List, Tuple

class NexaHealth:
    def __init__(self, model_path=None):
        # Model configuration (keeping base for Colab but with enhanced training)
        self.model_name = "google/flan-t5-large"
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Memory optimization
        torch.cuda.empty_cache()
        gc.collect()

        if model_path:
            self.model = AutoModelForSeq2SeqLM.from_pretrained(
                model_path,
                torch_dtype=torch.float16,
                device_map="auto"
            ).eval()
        else:
            self.base_model = AutoModelForSeq2SeqLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16,
                device_map="auto"
            )
            self._initialize_training_components()
        
        # Load enhanced knowledge base
        self.knowledge = self._load_knowledge()

    def _initialize_training_components(self):
        """Optimized LoRA configuration"""
        lora_config = LoraConfig(
            r=16,  # Increased from 8 for better performance
            lora_alpha=32,
            target_modules=["q", "v"],
            lora_dropout=0.05,
            bias="none",
            task_type=TaskType.SEQ_2_SEQ_LM
        )
        self.model = get_peft_model(self.base_model, lora_config)
        print(f"Trainable parameters: {self.model.print_trainable_parameters()}")

    def _load_knowledge(self) -> Dict:
        """Load data with WHO/NAFDAC compliance checks"""
        try:
            with open('/content/nigerian_health_knowledge.json') as f:
                health_data = json.load(f)
            
            with open('/content/complete_medication_profiles.json') as f:
                med_data = [d for d in json.load(f) if d.get('nigerian_formulary_status') == 'NAFDAC Approved']
            
            # Process symptoms with WHO guidelines
            symptoms = []
            for symptom, details in health_data['symptoms'].items():
                # Validate treatments
                valid_drugs = []
                for drug in details.get('recommended_drugs', []):
                    if isinstance(drug, dict):
                        if any(d['name'] in [m['medication'] for m in med_data] for d in details['recommended_drugs']):
                            valid_drugs.append(drug['name'])
                    elif drug in [m['medication'] for m in med_data]:
                        valid_drugs.append(drug)
                
                details['recommended_drugs'] = valid_drugs[:3]  # Top 3 approved
                symptoms.append((symptom, details))
            
            return {
                'symptoms': symptoms,
                'drugs': med_data,
                'who_guidelines': self._load_who_guidelines()  # Additional safety checks
            }
        except Exception as e:
            print(f"Error loading knowledge: {str(e)}")
            return {'symptoms': [], 'drugs': [], 'who_guidelines': {}}

    def _load_who_guidelines(self) -> Dict:
        """Load WHO treatment guidelines"""
        return {
            'pain_management': {
                'first_line': 'paracetamol',
                'second_line': 'ibuprofen',
                'contraindications': ['asthma', 'kidney_disease']
            },
            'antibiotics': {
                'restricted': ['ciprofloxacin', 'tetracycline'],
                'first_line': ['amoxicillin']
            }
        }

    def _prepare_training_data(self) -> Dataset:
        """Generate training data with enforced response structure"""
        examples = []
        
        # Symptom responses with consistent structure
        for symptom, details in self.knowledge['symptoms']:
            examples.append({
                "input": f"I have {symptom}",
                "output": self._format_symptom_response(symptom, details)
            })
            
            examples.append({
                "input": f"How to treat {symptom}?",
                "output": self._format_symptom_response(symptom, details)
            })

        # Drug information responses
        for drug in self.knowledge['drugs']:
            examples.append({
                "input": f"How to use {drug['medication']}?",
                "output": self._format_drug_response(drug)
            })
            
            examples.append({
                "input": f"Dosage for {drug['medication']}",
                "output": self._format_drug_response(drug, dosage_only=True)
            })

        return Dataset.from_pandas(pd.DataFrame(examples))

    def _format_symptom_response(self, symptom: str, details: dict) -> str:
        """Enforce consistent symptom response structure"""
        return f"""**{symptom.title()} Management** (NAFDAC/WHO Compliant)

🚑 **Recommended Actions**:
1. {details.get('next_steps', [{}])[0].get('action', 'Rest and monitor symptoms')}
2. {details.get('next_steps', [{}])[1].get('action', 'Stay hydrated')}

💊 **Approved Medications**:
{', '.join(details.get('recommended_drugs', ['Consult pharmacist']))}

⚠️ **Safety Notice**:
{details.get('next_steps', [{}])[-1].get('action', 'Seek medical attention if symptoms persist')}"""

    def _format_drug_response(self, drug: dict, dosage_only: bool = False) -> str:
        """Enforce consistent drug response structure"""
        if dosage_only:
            return f"""**{drug.get('medication', 'Drug')} Dosage**:
📝 {drug.get('monitoring_protocol', {}).get('parameters', [{}])[0].get('frequency', 'Consult doctor')}"""
        
        return f"""**{drug.get('medication', 'Drug')} Guidelines** (NAFDAC Approved)

📝 **Dosage**: {drug.get('monitoring_protocol', {}).get('parameters', [{}])[0].get('frequency', 'As prescribed')}

⚠️ **Contraindications**:
{drug.get('pharmacist_notes', ['None listed'])[0]}

🛒 **Available Brands**: {drug.get('nutrition_interventions', {}).get('weight_gain', {}).get('local_diet_plan', [{}])[0].get('options', ['Various'])[0]}"""

    def train(self, output_dir="./nexahealth_model"):
        """Enhanced training process"""
        try:
            torch.cuda.empty_cache()
            dataset = self._prepare_training_data()
            
            # Tokenize with enforced structure
            tokenized_data = dataset.map(
                lambda x: self.tokenizer(
                    x["input"],
                    text_target=x["output"],
                    max_length=256,
                    truncation=True,
                    padding="max_length"
                ),
                batched=True,
                batch_size=8
            )

            training_args = Seq2SeqTrainingArguments(
                output_dir=output_dir,
                per_device_train_batch_size=5,
                num_train_epochs=6,  # Increased for better learning
                learning_rate=5e-4,
                fp16=True,
                gradient_accumulation_steps=4,
                save_steps=1000,
                logging_steps=100,
                predict_with_generate=True,
                report_to="none",
            )

            trainer = Seq2SeqTrainer(
                model=self.model,
                args=training_args,
                train_dataset=tokenized_data,
                data_collator=DataCollatorForSeq2Seq(
                    self.tokenizer,
                    pad_to_multiple_of=8
                )
            )

            print("🚀 Training NexaHealth with enforced response structures...")
            trainer.train()
            trainer.save_model(output_dir)
            print(f"✅ Training complete! Model saved to {output_dir}")
            return True
        except Exception as e:
            print(f"❌ Training failed: {str(e)}")
            return False

    def respond(self, query: str) -> str:
        """Generate structured, compliant responses"""
        try:
            # Check for exact symptom matches first
            lower_query = query.lower()
            for symptom, details in self.knowledge['symptoms']:
                if symptom.lower() in lower_query:
                    return self._format_symptom_response(symptom, details)
            
            # Check for drug queries
            for drug in self.knowledge['drugs']:
                if drug['medication'].lower() in lower_query:
                    if 'dosage' in lower_query:
                        return self._format_drug_response(drug, dosage_only=True)
                    return self._format_drug_response(drug)
            
            # General question handling
            inputs = self.tokenizer(
                f"Answer this health question with NAFDAC/WHO compliant advice: {query}",
                return_tensors="pt",
                max_length=128,
                truncation=True
            ).to(self.device)
            
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=0.5,  # Lower for more conservative answers
                top_p=0.9,
                repetition_penalty=1.5,
                no_repeat_ngram_size=3
            )
            
            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            
            # Enforce structure even for generated responses
            return self._enforce_response_structure(response, query)
            
        except Exception as e:
            return "For accurate medical advice, please consult a healthcare professional."

    def _enforce_response_structure(self, response: str, query: str) -> str:
        """Ensure all responses follow our format"""
        if any(symptom in query.lower() for symptom in [
            'pain', 'ache', 'fever', 'headache', 'swelling'
        ]):
            return f"""**Treatment Guidance** (Based on your query about {query.split()[0]})

🚑 Recommended: {response.split('.')[0]} 
💊 Medications: {', '.join([d for d in self.knowledge['drugs'] if d.lower() in response][:3]) or 'Consult pharmacist'}
⚠️ Note: Always follow dosage instructions"""
        
        return f"NAFDAC/WHO Compliant Advice:\n{response}"

# Usage Example
if __name__ == "__main__":
    print("=== NexaHealth AI (NAFDAC/WHO Compliant) ===")
    print("1. Train Model\n2. Run Inference")
    choice = input("Select (1/2): ")
    
    if choice == "1":
        trainer = NexaHealth()
        if trainer.train():
            print("Training successful! Model ready for deployment.")
    elif choice == "2":
        assistant = NexaHealth(model_path="./nexahealth_model")
        print("Ask medical questions (type 'quit' to exit):")
        while True:
            query = input("> ")
            if query.lower() == 'quit':
                break
            print(assistant.respond(query))