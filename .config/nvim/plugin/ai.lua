_G.CodeCompanionWinbar = nil
local keymap = Jili.keymap
local later = require("q").later

later(function()
	vim.pack.add({
		"https://github.com/nvim-lua/plenary.nvim",
		"https://github.com/olimorris/codecompanion.nvim",
	})

	local function get_op_key(key_name)
		local cache_dir = vim.fn.stdpath("cache") .. "/op_api_keys"
		local cache_file = cache_dir .. "/" .. key_name

		local f = io.open(cache_file, "r")
		if f then
			local cached = f:read("*a")
			f:close()
			if cached and #cached > 0 then
				return vim.trim(cached)
			end
		end

		local obj = vim.system({
			"op",
			"read",
			"op://apikey/" .. key_name .. "/credential",
			"--no-newline",
		}):wait()

		local key = vim.trim(obj.stdout or "")
		if key ~= "" then
			vim.fn.mkdir(cache_dir, "p")
			local wf = io.open(cache_file, "w")
			if wf then
				wf:write(key)
				wf:close()
			end
		end

		return key
	end

	local codecompanion = require("codecompanion")
	codecompanion.setup({
		display = {
			chat = {
				show_token_count = false,
			},
			action_palette = {
				prompt = "Prompt ",
				provider = "fzf_lua",
				opts = {
					show_preset_actions = false,
					show_preset_prompts = true,
					title = "",
				},
			},
		},
		extensions = {},
		interactions = {
			cmd = {
				adapter = "deepseek",
			},
			inline = {
				adapter = "deepseek",
			},
			chat = {
				adapter = "deepseek",
			},
			cli = {
				agent = "pi",
				agents = {
					pi = {
						cmd = "pi",
						args = {},
						description = "Pi Coding Agent",
						provider = "terminal",
					},
				},
			},
		},
		opts = {
			language = "Chinese",
		},
		adapters = {
			http = {
				deepseek = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "DeepSeek",
						env = {
							api_key = function()
								return get_op_key("DEEPSEEK_API_KEY")
							end,
							url = "https://api.deepseek.com",
						},
						schema = {
							model = {
								default = "deepseek-v4-flash",
							},
						},
					})
				end,
				kimi = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "Kimi",
						env = {
							api_key = function()
								return get_op_key("KIMI_CODE_KEY")
							end,
							url = "https://api.moonshot.cn",
						},
						schema = {
							model = {
								default = "kimi-k2.5",
							},
						},
					})
				end,
				bailian = function()
					return require("codecompanion.adapters").extend("openai_compatible", {
						formatted_name = "Bailian",
						env = {
							api_key = function()
								return get_op_key("BAILIAN_API_KEY")
							end,
							url = "https://dashscope.aliyuncs.com/compatible-mode",
						},
						schema = {
							model = {
								default = "MiniMax-M2.5",
							},
						},
					})
				end,
			},
		},
	})
	keymap({ "n", "v" }, "<leader>ac", codecompanion.actions, "Code Companion Actions")
	keymap({ "n", "v" }, "<leader>aa", codecompanion.toggle_cli, "Toggle Code Companion Chat")
	keymap("v", "ga", codecompanion.add, "Add to Chat")

	Jili.autocmd("FileType", {
		pattern = { "codecompanion", "codecompanion_cli" },
		callback = function(event)
			local buf = event.buf
			local opt = vim.opt_local
			opt.number = false
			opt.relativenumber = false
			opt.signcolumn = "no"

			_G.CodeCompanionWinbar = function()
				local meta = _G.codecompanion_chat_metadata and _G.codecompanion_chat_metadata[buf]
				if not meta then
					return ""
				end
				return table.concat({
					"%#StatuslineAI#",
					" 󰧑 ",
					"%#StatuslineNC#",
					meta.adapter.formatted_name or meta.adapter.name,
					":",
					"%#StatuslineAI#",
					meta.adapter.model,
					"%*",
					"%=",
					"%#StatuslineNC#",
					meta.tokens,
					" tokens",
					"%*",
				})
			end
			vim.wo.winbar = "%{%v:lua.CodeCompanionWinbar()%}"
		end,
	})
end)

later(function()
	vim.pack.add({
		"https://github.com/monkoose/neocodeium",
	})
	local neocodeium = require("neocodeium")
	neocodeium.setup({
		show_label = false,
		silent = true,
		filetypes = {
			c = false,
			markdown = false,
			zig = false,
		},
	})

	keymap("i", "<C-f>", neocodeium.accept, "Accept suggestion")
	keymap("i", "<A-w>", neocodeium.accept_word, "Accept word")
	keymap("i", "<A-l>", neocodeium.accept_line, "Accept line")
	keymap({ "n", "i" }, "<A-c>", neocodeium.clear, "Clear suggestion")
end)
