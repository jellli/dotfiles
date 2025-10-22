local function anthropic_with_bearer_token()
  local utils = require("codecompanion.utils.adapters")
  local tokens = require("codecompanion.utils.tokens")

  return require("codecompanion.adapters").extend("anthropic", {
    env = {
      bearer_token = "ANTHROPIC_BEARER_TOKEN",
    },
    headers = {
      ["content-type"] = "application/json",
      ["authorization"] = "Bearer ${bearer_token}",
      ["anthropic-version"] = "2023-06-01",
      ["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    },
    handlers = {
      setup = function(self)
        -- Remove x-api-key header if it exists (from base adapter)
        if self.headers and self.headers["x-api-key"] then
          self.headers["x-api-key"] = nil
        end
        -- Same as current setup function but removing the additional headers being added

        if self.opts and self.opts.stream then
          self.parameters.stream = true
        end

        local model = self.schema.model.default
        local model_opts = self.schema.model.choices[model]
        if model_opts and model_opts.opts then
          self.opts = vim.tbl_deep_extend("force", self.opts, model_opts.opts)
          if not model_opts.opts.has_vision then
            self.opts.vision = false
          end
        end

        return true
      end,

      form_messages = function(self, messages)
        -- Same as current form_message but adding Claude Code system message at the first system message

        local has_tools = false

        local system = vim
          .iter(messages)
          :filter(function(msg)
            return msg.role == "system"
          end)
          :map(function(msg)
            return {
              type = "text",
              text = msg.content,
              cache_control = nil,
            }
          end)
          :totable()

        -- Add the Claude Code system message at the beginning (required to make it work)
        table.insert(system, 1, {
          type = "text",
          text = "You are Claude Code, Anthropic's official CLI for Claude.",
          cache_control = {
            type = "ephemeral",
          },
        })

        system = next(system) and system or nil

        messages = vim
          .iter(messages)
          :filter(function(msg)
            return msg.role ~= "system"
          end)
          :totable()

        messages = vim.tbl_map(function(message)
          if message.opts and message.opts.tag == "image" and message.opts.mimetype then
            if self.opts and self.opts.vision then
              message.content = {
                {
                  type = "image",
                  source = {
                    type = "base64",
                    media_type = message.opts.mimetype,
                    data = message.content,
                  },
                },
              }
            else
              return nil
            end
          end

          message = filter_out_messages({
            message = message,
            allowed_words = { "content", "role", "reasoning", "tool_calls" },
          })

          if message.role == self.roles.user or message.role == self.roles.llm then
            if message.role == self.roles.user and message.content == "" then
              message.content = "<prompt></prompt>"
            end

            if type(message.content) == "string" then
              message.content = {
                { type = "text", text = message.content },
              }
            end
          end

          if message.tool_calls and vim.tbl_count(message.tool_calls) > 0 then
            has_tools = true
          end

          if message.role == "tool" then
            message.role = self.roles.user
          end

          if has_tools and message.role == self.roles.llm and message.tool_calls then
            message.content = message.content or {}
            for _, call in ipairs(message.tool_calls) do
              table.insert(message.content, {
                type = "tool_use",
                id = call.id,
                name = call["function"].name,
                input = vim.json.decode(call["function"].arguments),
              })
            end
            message.tool_calls = nil
          end

          if message.reasoning and type(message.content) == "table" then
            table.insert(message.content, 1, {
              type = "thinking",
              thinking = message.reasoning.content,
              signature = message.reasoning._data.signature,
            })
          end

          return message
        end, messages)

        messages = utils.merge_messages(messages)

        if has_tools then
          for _, m in ipairs(messages) do
            if m.role == self.roles.user and m.content and m.content ~= "" then
              if type(m.content) == "table" and m.content.type then
                m.content = { m.content }
              end

              if type(m.content) == "table" and vim.islist(m.content) then
                local consolidated = {}
                for _, block in ipairs(m.content) do
                  if block.type == "tool_result" then
                    local prev = consolidated[#consolidated]
                    if prev and prev.type == "tool_result" and prev.tool_use_id == block.tool_use_id then
                      prev.content = prev.content .. block.content
                    else
                      table.insert(consolidated, block)
                    end
                  else
                    table.insert(consolidated, block)
                  end
                end
                m.content = consolidated
              end
            end
          end
        end

        local breakpoints_used = 0
        for i = #messages, 1, -1 do
          local msgs = messages[i]
          if msgs.role == self.roles.user then
            for _, msg in ipairs(msgs.content) do
              if msg.type ~= "text" or msg.text == "" then
                goto continue
              end
              if
                tokens.calculate(msg.text) >= self.opts.cache_over
                and breakpoints_used < self.opts.cache_breakpoints
              then
                msg.cache_control = { type = "ephemeral" }
                breakpoints_used = breakpoints_used + 1
              end
              ::continue::
            end
          end
        end
        if system and breakpoints_used < self.opts.cache_breakpoints then
          for _, prompt in ipairs(system) do
            if breakpoints_used < self.opts.cache_breakpoints then
              prompt.cache_control = { type = "ephemeral" }
              breakpoints_used = breakpoints_used + 1
            end
          end
        end

        return { system = system, messages = messages }
      end,
    },
  })
end

return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "ravitemer/mcphub.nvim",
      -- "echasnovski/mini.diff",
      "github/copilot.vim",
    },
    cmd = { "CodeCompanion", "CodeCompanionChat" },
    keys = {
      {
        "<leader>ac",
        function()
          require("codecompanion").actions({})
        end,
        desc = "code companion actions",
        mode = { "n", "v" },
      },
      {
        "<leader>aa",
        function()
          require("codecompanion").toggle()
        end,
        desc = "toggle code companion chat",
        mode = { "n", "v" },
      },
      {
        "ga",
        "<cmd>CodeCompanionChat Add<cr>",
        mode = { "v" },
      },
    },
    opts = {
      extensions = {
        mcphub = {
          callback = "mcphub.extensions.codecompanion",
          opts = {
            make_vars = true,
            make_slash_commands = true,
            show_result_in_chat = true,
          },
        },
      },
      strategies = {
        --[[ cmd = {
          adapter = "anthropic_with_bearer_token",
          model = "claude-3-5-sonnet-20241022",
        },
        inline = {
          adapter = "anthropic_with_bearer_token",
          model = "claude-3-5-sonnet-20241022",
        },
        chat = {
          adapter = "anthropic_with_bearer_token",
          model = "claude-3-5-sonnet-20241022",
        }, ]]
      },
      opts = {
        language = "Chinese",
      },
      adapters = {
        http = {
          anthropic_with_bearer_token = anthropic_with_bearer_token,
          copilot = function()
            return require("codecompanion.adapters").extend("copilot", {
              schema = {
                model = {
                  default = "claude-sonnet-4.5",
                },
              },
            })
          end,
        },
        -- opts = {
        -- allow_insecure = true,
        -- proxy = "socks5://127.0.0.1:7890",
        -- },
      },
      prompt_library = {
        ["Commit concise"] = {
          strategy = "chat",
          description = "Generate a conventional commit message without long description.",
          opts = {
            short_name = "commit-concise",
            auto_submit = true,
            adapter = {
              name = "copilot",
            },
          },
          prompts = {
            {
              role = "user",
              content = function()
                return string.format(
                  [[I want you to use the @{cmd_runner} tool to create a commit using a concise commit message that follows the conventional commit format. Make sure to:
1. Use only a header (no detailed description).
2. Choose the correct scope based on the changes.
3. Ensure the message is clear, relevant, and properly formatted.
4. DO NOT run git add, as all the changes is provided and already staged.

Here is the diff:

```diff
%s
```]],
                  vim.fn.system("git diff --no-ext-diff --staged")
                )
              end,
              opts = {
                contains_code = true,
              },
            },
          },
        },
      },
    },
  },
  {

    "ravitemer/mcphub.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    cmd = "MCPHub",
    build = "bundled_build.lua",
    config = function()
      require("mcphub").setup({
        use_bundled_binary = true,
        auto_approve = true,
        codecompanion = {
          show_result_in_chat = true,
          make_vars = true,
        },
      })
    end,
  },
  -- {
  --   "echasnovski/mini.diff",
  --   config = function()
  --     local diff = require("mini.diff")
  --     diff.setup({
  --       -- Disabled by default
  --       source = diff.gen_source.none(),
  --     })
  --   end,
  -- },
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = { "markdown", "codecompanion" },
    opts = {
      render_modes = true,
      sign = {
        enabled = false,
      },
    },
  },
  {
    "github/copilot.vim",
    cmd = "Copilot",
    event = "BufReadPost",
    init = function()
      vim.g.copilot_no_maps = true
      vim.g.copilot_proxy = "socks5://localhost:7890"
      vim.keymap.set("i", "<C-f>", 'copilot#Accept("\\<CR>")', {
        expr = true,
        replace_keycodes = false,
      })
      vim.g.copilot_no_tab_map = true
    end,
    config = function()
      -- Block the normal Copilot suggestions
      vim.api.nvim_create_augroup("github_copilot", { clear = true })
      vim.api.nvim_create_autocmd({ "FileType", "BufUnload" }, {
        group = "github_copilot",
        callback = function(args)
          vim.fn["copilot#On" .. args.event]()
        end,
      })
      vim.fn["copilot#OnFileType"]()
    end,
  },
}
