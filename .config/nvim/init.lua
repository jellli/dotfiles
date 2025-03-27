if vim.g.vscode then
	-- VSCode extension
	local vscode = require("vscode")
	require("jili.config.vscode-lazy")
	vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
		vscode.with_insert(function()
			vscode.action("editor.action.addSelectionToNextFindMatch")
		end)
	end)
	require("jili.config.options")
	require("jili.config.remap")

	print("VSCodes")
else
	-- ordinary Neovim
	require("jili.config.options")
	require("jili.config.remap")
	require("jili.config.lazy")
	require("jili.config.autocmd")

	vim.lsp.enable({
		"lua-ls",
		"zls",
		"cssmodules",
		"cssls",
		"emmet-ls",
		"biome",
		"marksman",
		"vtsls",
		"tailwindcss",
		"html",
	})
end
