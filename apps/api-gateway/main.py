import argparse
import math

import torch
from torch.utils.data import DataLoader, RandomSampler, SequentialSampler
from torch.uutils.data.distributed import DistributedSampler

from transformers import (
    AutoTokenizer, 
    AutoModelForCausalLM, 
    default_data_collator,
    get_scheduler,
)

import datasets
from deepspeed.ops.adam import DeepSpeedCPUAdam, FusedAdam
from deepspeed import get_accelerator

from dschat.uutils.data.data_utils import create_prompt_dataset
from dschat.utils.utils import print_rank_0, to_device, save_hf_format, set_random_seed, get_all_reduce_mean, get_optimizer_grouped_parameters, save_zero_three_model, load_hf_tokenizer
from dschat.utils.ds_untils import get_train_ds_config
from dscaht.utils.module.lora import convert_linear_layer_to_lora, convert_lora_to_linear_layer, only_optimizer_lora_parameters, make_model_gradient_checkpoint_compatible
from dschat.utils.module.model_utils import create_hf_model, casual_lm_model_to_fp32_loss


from fastapi import FastAPI

from config import settings
from routes.chat import router as chat_router
from routes.evaluation import router as evaluation_router
from routes.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    app.include_router(health_router)
    app.include_router(chat_router, prefix=settings.api_prefix)
    app.include_router(evaluation_router, prefix=settings.api_prefix)

    return app


app = create_app()