return {
	"nvim-lualine/lualine.nvim",
	config = function()
		local mode = {
			"mode",
			fmt = function(str)
				-- return " " .. str
				return " " .. str:sub(1, 1) -- displays only the first character of the mode
			end,
		}

		local filename = {
			"filename",
			file_status = true, -- displays file status (readonly status, modified status)
			path = 0, -- 0 = just filename, 1 = relative path, 2 = absolute path
		}

		local hide_in_width = function()
			return vim.fn.winwidth(0) > 100
		end

		local diagnostics = {
			"diagnostics",
			sources = { "nvim_diagnostic" },
			sections = { "error", "warn" },
			symbols = { error = " ", warn = " ", info = " ", hint = " " },
			colored = false,
			update_in_insert = false,
			always_visible = false,
			cond = hide_in_width,
		}

		local diff = {
			"diff",
			colored = false,
			symbols = { added = " ", modified = " ", removed = " " }, -- changes diff symbols
			cond = hide_in_width,
		}

		-- codeium
		local codeium = function()
			local symbols = {
				status = {
					[0] = "󰚩 ", -- Enabled
					[1] = "󱚧 ", -- Disabled Globally
					[2] = "󱙻 ", -- Disabled for Buffer
					[3] = "󱙺 ", -- Disabled for Buffer filetype
					[4] = "󱙺 ", -- Disabled for Buffer with enabled function
					[5] = "󱚠 ", -- Disabled for Buffer encoding
				},
				server_status = {
					[0] = "󰣺 ", -- Connected
					[1] = "󰣻 ", -- Connecting
					[2] = "󰣽 ", -- Disconnected
				},
			}

			local status, server_status = require("neocodeium").get_status()
			return symbols.status[status] .. symbols.server_status[server_status]
		end

		require("lualine").setup({
			options = {
				icons_enabled = true,
				theme = "auto", -- Set theme based on environment variable
				-- Some useful glyphs:
				-- https://www.nerdfonts.com/cheat-sheet
				--        
				section_separators = { left = "", right = "" },
				component_separators = { left = "", right = "" },
				disabled_filetypes = { "alpha", "neo-tree" },
				always_divide_middle = true,
			},
			sections = {
				lualine_a = { mode },
				lualine_b = {
					"branch",
				},
				lualine_c = { filename },
				lualine_x = {
					codeium,
					diagnostics,
					diff,
					{ "encoding", cond = hide_in_width },
					{ "filetype", cond = hide_in_width },
				},
				lualine_y = { "location" },
				lualine_z = { "progress" },
			},
			inactive_sections = {
				lualine_a = {},
				lualine_b = {},
				lualine_c = { { "filename", path = 1 } },
				lualine_x = { { "location", padding = 0 } },
				lualine_y = {},
				lualine_z = {},
			},
			tabline = {},
			extensions = { "fugitive" },
		})
	end,
}
